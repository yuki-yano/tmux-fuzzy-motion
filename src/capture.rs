use anyhow::{Result, anyhow};

use crate::tmux::{s, tmux};
use crate::types::PaneCapture;

pub fn capture_pane(pane_id: &str) -> Result<PaneCapture> {
    let raw = tmux(&s(&["capture-pane", "-p", "-M", "-e", "-t", pane_id]))
        .map_err(|error| anyhow!("tmux-fuzzy-motion: failed to capture pane: {error}"))?;
    let display_text = raw.replace('\r', "").trim_end_matches('\n').to_string();
    let stripped = strip_ansi_escapes::strip(display_text.as_bytes());
    let text = String::from_utf8_lossy(&stripped).to_string();
    Ok(PaneCapture {
        lines: if text.is_empty() {
            Vec::new()
        } else {
            text.lines().map(ToOwned::to_owned).collect()
        },
        display_lines: if display_text.is_empty() {
            Vec::new()
        } else {
            display_text.lines().map(ToOwned::to_owned).collect()
        },
    })
}

pub fn fit_capture_to_height(capture: PaneCapture, height: usize) -> PaneCapture {
    PaneCapture {
        lines: tail(capture.lines, height),
        display_lines: tail(capture.display_lines, height),
    }
}

fn tail<T>(mut values: Vec<T>, height: usize) -> Vec<T> {
    if values.len() <= height {
        values
    } else {
        values.split_off(values.len() - height)
    }
}
