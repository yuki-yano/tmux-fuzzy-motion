use anyhow::Result;

use crate::tmux::{s, tmux};
use crate::types::MatchTarget;

pub fn move_copy_cursor(pane_id: &str, target: &MatchTarget) -> Result<()> {
    tmux(&s(&["send-keys", "-X", "-t", pane_id, "top-line"]))?;
    if target.candidate.line > 1 {
        tmux(&s(&[
            "send-keys",
            "-X",
            "-N",
            &target.candidate.line.saturating_sub(1).to_string(),
            "-t",
            pane_id,
            "cursor-down",
        ]))?;
    }
    tmux(&s(&["send-keys", "-X", "-t", pane_id, "start-of-line"]))?;
    let right = target.candidate.char_col + target.primary_char;
    if right > 0 {
        tmux(&s(&[
            "send-keys",
            "-X",
            "-N",
            &right.to_string(),
            "-t",
            pane_id,
            "cursor-right",
        ]))?;
    }
    Ok(())
}
