use std::env;
use std::fs;
use std::thread;

use anyhow::{Result, anyhow, bail};
use tempfile::tempdir;

use crate::action::move_copy_cursor;
use crate::capture::{capture_pane, fit_capture_to_height};
use crate::tmux::{
    enter_copy_mode, get_pane_start_context, list_window_panes, s, tmux, tmux_quiet,
};
use crate::types::{InputResult, InputState, PaneSnapshot, PopupState, Scope, ScopeArg};
use crate::width::compact_styled_display_cells;

pub fn run_start(scope: ScopeArg, pane_id: String, client_tty: String) -> Result<()> {
    if env::var_os("TMUX").is_none() {
        bail!("tmux-fuzzy-motion: must be run inside tmux");
    }
    let temp_dir = tempdir()?;
    let state_file = temp_dir.path().join("state.json");
    let result_file = temp_dir.path().join("result.json");
    let popup_state = match scope {
        ScopeArg::Current => build_current_state(&pane_id, &client_tty)?,
        ScopeArg::All => build_all_pane_state(&pane_id, &client_tty)?,
    };
    fs::write(&state_file, serde_json::to_vec(&popup_state.state)?)?;

    let exe = env::current_exe()?;
    let mut command = vec![
        "display-popup".to_string(),
        "-E".to_string(),
        "-B".to_string(),
        "-c".to_string(),
        client_tty.clone(),
        "-t".to_string(),
        pane_id.clone(),
        "-d".to_string(),
        popup_state.current_path.clone(),
        "-x".to_string(),
        popup_state
            .x
            .unwrap_or_else(|| "#{popup_pane_left}".to_string()),
        "-y".to_string(),
        popup_state
            .y
            .unwrap_or_else(|| "#{popup_pane_top}".to_string()),
        "-w".to_string(),
        popup_state.state.width.to_string(),
        "-h".to_string(),
        popup_state.state.height.to_string(),
        exe.to_string_lossy().to_string(),
        "popup".to_string(),
        "--state-file".to_string(),
        state_file.to_string_lossy().to_string(),
        "--result-file".to_string(),
        result_file.to_string_lossy().to_string(),
    ];
    tmux(&command)?;

    let result_text = fs::read_to_string(&result_file)
        .map_err(|error| anyhow!("tmux-fuzzy-motion: popup did not produce result: {error}"))?;
    let result: InputResult = serde_json::from_str(&result_text)?;
    if let InputResult::Selected { target } = result {
        let target_pane = target
            .candidate
            .pane_id
            .clone()
            .unwrap_or_else(|| pane_id.clone());
        tmux_quiet(&s(&["select-pane", "-t", &target_pane]));
        if popup_state.state.scope == Scope::All
            && !popup_state
                .state
                .panes
                .iter()
                .any(|pane| pane.pane_id == target_pane && pane.in_copy_mode)
        {
            enter_copy_mode(&target_pane)?;
        }
        move_copy_cursor(&target_pane, &target)?;
    }
    command.clear();
    Ok(())
}

fn build_current_state(pane_id: &str, client_tty: &str) -> Result<PopupState> {
    let pane = get_pane_start_context(pane_id)?;
    if !pane.in_copy_mode {
        enter_copy_mode(pane_id)?;
    }
    let capture = fit_capture_to_height(capture_pane(pane_id)?, pane.height);
    Ok(PopupState {
        current_path: pane.current_path,
        x: None,
        y: None,
        state: InputState {
            scope: Scope::Current,
            pane_id: pane.pane_id,
            client_tty: client_tty.to_string(),
            display_lines: capture.display_lines,
            plain_lines: capture.lines,
            width: pane.width,
            height: pane.height,
            panes: Vec::new(),
        },
    })
}

fn build_all_pane_state(pane_id: &str, client_tty: &str) -> Result<PopupState> {
    let panes = list_window_panes(pane_id)?;
    let target = panes
        .iter()
        .find(|pane| pane.pane_id == pane_id)
        .or_else(|| panes.iter().find(|pane| pane.active))
        .or_else(|| panes.first())
        .ok_or_else(|| anyhow!("tmux-fuzzy-motion: pane not found"))?;
    let left = panes.iter().map(|pane| pane.left).min().unwrap_or(0);
    let top = panes.iter().map(|pane| pane.top).min().unwrap_or(0);
    let right = panes
        .iter()
        .map(|pane| pane.left + pane.width)
        .max()
        .unwrap_or(0);
    let bottom = panes
        .iter()
        .map(|pane| pane.top + pane.height)
        .max()
        .unwrap_or(0);
    let snapshots: Vec<PaneSnapshot> = thread::scope(|scope| {
        let handles = panes
            .iter()
            .map(|pane| {
                scope.spawn(move || {
                    let capture = fit_capture_to_height(capture_pane(&pane.pane_id)?, pane.height);
                    Ok(PaneSnapshot {
                        pane_id: pane.pane_id.clone(),
                        in_copy_mode: pane.in_copy_mode,
                        width: pane.width,
                        height: pane.height,
                        left: pane.left.saturating_sub(left),
                        top: pane.top.saturating_sub(top),
                        plain_lines: capture.lines,
                        display_lines: capture.display_lines,
                    })
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .map_err(|_| anyhow!("tmux-fuzzy-motion: failed to capture pane"))?
            })
            .collect::<Result<_>>()
    })?;
    let width = right.saturating_sub(left);
    let height = bottom.saturating_sub(top);
    let display_lines = compose_display_lines(&snapshots, width, height, &target.border_lines);
    Ok(PopupState {
        current_path: target.current_path.clone(),
        x: Some(build_popup_relative_position('x', left)),
        y: Some(build_popup_relative_position('y', top)),
        state: InputState {
            scope: Scope::All,
            pane_id: pane_id.to_string(),
            client_tty: client_tty.to_string(),
            display_lines,
            plain_lines: Vec::new(),
            width,
            height,
            panes: snapshots,
        },
    })
}

fn build_popup_relative_position(axis: char, target_origin: usize) -> String {
    if axis == 'x' {
        format!("#{{e|+|:#{{popup_pane_left}},#{{e|-|:{target_origin},#{{pane_left}}}}}}")
    } else {
        let top_offset =
            "#{?#{==:#{status-position},top},#{e|-|:#{client_height},#{window_height}},0}";
        let desired_top =
            format!("#{{e|+|:#{{e|-|:{target_origin},#{{window_offset_y}}}},{top_offset}}}");
        format!("#{{e|+|:#{{popup_height}},{desired_top}}}")
    }
}

fn compose_display_lines(
    panes: &[PaneSnapshot],
    width: usize,
    height: usize,
    border_lines: &str,
) -> Vec<String> {
    let mut rows = vec![vec![" ".to_string(); width]; height];
    let mut occupied = vec![vec![false; width]; height];
    for pane in panes {
        for row in pane.top..pane.top + pane.height {
            if let Some(occupied_row) = occupied.get_mut(row) {
                for col in pane.left..pane.left + pane.width {
                    if col < occupied_row.len() {
                        occupied_row[col] = true;
                    }
                }
            }
        }
    }
    for pane in panes {
        for (line_index, line) in pane.display_lines.iter().enumerate() {
            let Some(row) = rows.get_mut(pane.top + line_index) else {
                continue;
            };
            for (cell_index, cell) in compact_styled_display_cells(line).into_iter().enumerate() {
                let col = pane.left + cell_index;
                if col < row.len() {
                    row[col] = cell;
                }
            }
        }
    }
    draw_pane_borders(&mut rows, &occupied, border_lines);
    rows.into_iter()
        .map(|row| row.join("").trim_end().to_string())
        .collect()
}

fn border_set(border_lines: &str) -> (&'static str, &'static str, &'static str) {
    match border_lines {
        "single" => ("│", "─", "┼"),
        "double" => ("║", "═", "╬"),
        "heavy" => ("┃", "━", "╋"),
        "spaces" => (" ", " ", " "),
        _ => ("|", "-", "+"),
    }
}

fn draw_pane_borders(rows: &mut [Vec<String>], occupied: &[Vec<bool>], border_lines: &str) {
    let (vertical, horizontal, intersection) = border_set(border_lines);
    for row_index in 0..rows.len() {
        for column_index in 0..rows[row_index].len() {
            if occupied[row_index][column_index] {
                continue;
            }
            let left = column_index > 0 && occupied[row_index][column_index - 1];
            let right = occupied[row_index]
                .get(column_index + 1)
                .copied()
                .unwrap_or(false);
            let top = row_index > 0 && occupied[row_index - 1][column_index];
            let bottom = occupied
                .get(row_index + 1)
                .and_then(|row| row.get(column_index))
                .copied()
                .unwrap_or(false);
            let has_vertical = left || right;
            let has_horizontal = top || bottom;
            rows[row_index][column_index] = if has_vertical && has_horizontal {
                intersection.to_string()
            } else if has_vertical {
                vertical.to_string()
            } else if has_horizontal {
                horizontal.to_string()
            } else {
                rows[row_index][column_index].clone()
            };
        }
    }
}
