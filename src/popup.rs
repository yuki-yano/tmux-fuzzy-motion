use std::collections::HashMap;
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;

use anyhow::{Result, anyhow};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode};
use tempfile::tempdir;

use crate::action::move_copy_cursor;
use crate::capture::{capture_pane, fit_capture_to_height};
use crate::extract::extract_candidates;
use crate::matcher::{assign_hints, candidate_key, match_candidates};
use crate::overlay::OverlayBase;
use crate::tmux::{get_pane_start_context, s, tmux_quiet};
use crate::types::{Candidate, InputResult, InputState, MatchTarget, Scope};
use crate::width::{char_width, display_width, styled_display_cells};

const QUERY_STYLE: &str = "\x1b[48;5;236;38;5;252m";
const RESET: &str = "\x1b[0m";

pub fn run_popup_live(pane_id: String) -> Result<()> {
    let pane = get_pane_start_context(&pane_id)?;
    let temp_dir = tempdir()?;
    let state_file = temp_dir.path().join("state.json");
    let result_file = temp_dir.path().join("result.json");
    let capture = fit_capture_to_height(capture_pane(&pane_id)?, pane.height);
    let state = InputState {
        scope: Scope::Current,
        pane_id: pane.pane_id,
        client_tty: String::new(),
        display_lines: capture.display_lines,
        plain_lines: capture.lines,
        width: pane.width,
        height: pane.height,
        panes: Vec::new(),
    };
    fs::write(&state_file, serde_json::to_vec(&state)?)?;
    run_popup(state_file, result_file.clone())?;
    let result_text = fs::read_to_string(&result_file)
        .map_err(|error| anyhow!("tmux-fuzzy-motion: popup did not produce result: {error}"))?;
    let result: InputResult = serde_json::from_str(&result_text)?;
    if let InputResult::Selected { target } = result {
        tmux_quiet(&s(&["select-pane", "-t", &pane_id]));
        move_copy_cursor(&pane_id, &target)?;
    }
    Ok(())
}

pub fn run_popup(state_file: PathBuf, result_file: PathBuf) -> Result<()> {
    let state: InputState = serde_json::from_slice(&fs::read(&state_file)?)?;
    let result = run_popup_job(&state)?;
    fs::write(result_file, serde_json::to_vec(&result)?)?;
    Ok(())
}

struct RawModeGuard;

impl Drop for RawModeGuard {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = write!(io::stdout(), "\x1b[?25h\x1b[?7h");
        let _ = io::stdout().flush();
    }
}

fn run_popup_job(state: &InputState) -> Result<InputResult> {
    enable_raw_mode()?;
    let _guard = RawModeGuard;
    let mut stdout = io::stdout();
    write!(stdout, "\x1b[?25l")?;

    let mut query = String::new();
    let mut previous_hints: HashMap<String, String> = HashMap::new();
    let mut matches: Vec<MatchTarget> = Vec::new();
    let mut previous_frame: Option<Vec<String>> = None;
    let mut candidates: Option<Vec<Candidate>> = None;
    let mut overlay_base: Option<OverlayBase> = None;
    render_frame(
        &mut stdout,
        state,
        &query,
        &matches,
        overlay_base.as_ref(),
        &mut previous_frame,
    )?;

    let mut stdin = io::stdin();
    let mut buffer = [0_u8; 1];
    loop {
        if stdin.read(&mut buffer)? == 0 {
            return Ok(InputResult::Cancelled);
        }
        let value = buffer[0];
        match value {
            0x1b | 0x07 => return Ok(InputResult::Cancelled),
            0x7f | 0x08 => {
                query.pop();
                previous_hints.clear();
            }
            0x15 => {
                query.clear();
                previous_hints.clear();
            }
            0x17 => {
                delete_backward_word(&mut query);
                previous_hints.clear();
            }
            0x0d | 0x0a => {
                return Ok(matches
                    .first()
                    .cloned()
                    .map(|target| InputResult::Selected {
                        target: Box::new(target),
                    })
                    .unwrap_or(InputResult::Cancelled));
            }
            value if value.is_ascii_graphic() || value == b' ' => {
                let ch = value as char;
                if let Some(selected) = matches.iter().find(|target| target.hint == ch.to_string())
                {
                    return Ok(InputResult::Selected {
                        target: Box::new(selected.clone()),
                    });
                }
                if is_query_char(ch) {
                    query.push(ch);
                }
            }
            _ => {}
        }
        matches = if query.is_empty() {
            Vec::new()
        } else {
            let candidates = candidates.get_or_insert_with(|| prepare_candidates(state));
            overlay_base.get_or_insert_with(|| OverlayBase::new(&state.display_lines));
            assign_hints(match_candidates(candidates, &query), &previous_hints)
        };
        previous_hints = matches
            .iter()
            .map(|target| (candidate_key(&target.candidate), target.hint.clone()))
            .collect();
        render_frame(
            &mut stdout,
            state,
            &query,
            &matches,
            overlay_base.as_ref(),
            &mut previous_frame,
        )?;
    }
}

fn render_frame(
    stdout: &mut io::Stdout,
    state: &InputState,
    query: &str,
    matches: &[MatchTarget],
    overlay_base: Option<&OverlayBase>,
    previous_frame: &mut Option<Vec<String>>,
) -> Result<()> {
    let mut body = if query.is_empty() || matches.is_empty() {
        state.display_lines.clone()
    } else {
        overlay_base
            .map(|base| base.render(matches))
            .unwrap_or_else(|| state.display_lines.clone())
    };
    body = fit_body_to_height(body, state.height);
    let last_line = body.len().saturating_sub(1);
    let current = body.get(last_line).cloned().unwrap_or_default();
    body[last_line] = render_query_on_bottom_line(&current, state.width, query);

    if let Some(previous) = previous_frame {
        write!(stdout, "\x1b[?7l")?;
        for (index, line) in body.iter().enumerate() {
            if previous.get(index) == Some(line) {
                continue;
            }
            write!(stdout, "\x1b[{};1H\x1b[2K{}", index + 1, line)?;
        }
        write!(stdout, "\x1b[H\x1b[?7h")?;
    } else {
        let output = create_initial_frame_output(&body);
        write!(stdout, "\x1b[?7l\x1b[2J\x1b[H{output}\x1b[H\x1b[?7h")?;
    }
    stdout.flush()?;
    *previous_frame = Some(body);
    Ok(())
}

fn fit_body_to_height(mut body: Vec<String>, height: usize) -> Vec<String> {
    body.truncate(height);
    while body.len() < height {
        body.push(String::new());
    }
    body
}

pub fn create_initial_frame_output(body: &[String]) -> String {
    let full = body
        .iter()
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\r\n");
    let sparse = body
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let trimmed = line.trim_end();
            (!trimmed.is_empty()).then(|| format!("\x1b[{};1H{trimmed}", index + 1))
        })
        .collect::<String>();
    if sparse.len() < full.len() {
        sparse
    } else {
        full
    }
}

fn render_query_on_bottom_line(line: &str, width: usize, query: &str) -> String {
    let mut cells = styled_display_cells(line);
    cells.resize(width, " ".to_string());
    let query_width = width.min(display_width(query));
    let mut cursor = width.saturating_sub(query_width);
    for ch in query.chars() {
        if cursor >= width {
            break;
        }
        cells[cursor] = format!("{QUERY_STYLE}{ch}{RESET}");
        cursor += char_width(ch);
    }
    cells.into_iter().take(width).collect()
}

fn delete_backward_word(query: &mut String) {
    while query.ends_with(' ') {
        query.pop();
    }
    while query.chars().last().is_some_and(is_query_char) {
        query.pop();
    }
}

fn is_query_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.' | '/' | ':' | '~')
}

fn prepare_candidates(state: &InputState) -> Vec<Candidate> {
    if state.scope == Scope::All {
        state
            .panes
            .iter()
            .flat_map(|pane| {
                extract_candidates(&pane.plain_lines)
                    .into_iter()
                    .map(|mut candidate| {
                        candidate.pane_id = Some(pane.pane_id.clone());
                        candidate.screen_line = Some(pane.top + candidate.line);
                        candidate.screen_col = Some(pane.left + candidate.col);
                        candidate
                    })
                    .collect::<Vec<_>>()
            })
            .collect()
    } else {
        extract_candidates(&state.plain_lines)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_sparse_initial_frame_when_smaller() {
        let mut body = vec![String::new(); 20];
        body[9] = "hello".to_string();
        assert_eq!(create_initial_frame_output(&body), "\x1b[10;1Hhello");
    }

    #[test]
    fn renders_full_initial_frame_with_carriage_returns() {
        let body = vec!["abc".to_string(), "def".to_string()];
        assert_eq!(create_initial_frame_output(&body), "abc\r\ndef");
    }
}
