use anyhow::{Context, Result, anyhow, bail};
use std::process::Command;

use crate::types::{PaneStartContext, WindowPaneContext};

pub fn run_process(command: &str, args: &[String]) -> Result<String> {
    let output = Command::new(command)
        .args(args)
        .output()
        .with_context(|| format!("failed to run {command}"))?;
    if !output.status.success() {
        bail!("{}", String::from_utf8_lossy(&output.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn tmux(args: &[String]) -> Result<String> {
    run_process("tmux", args)
}

pub fn tmux_quiet(args: &[String]) {
    let _ = tmux(args);
}

pub fn s(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

pub fn get_pane_start_context(pane_id: &str) -> Result<PaneStartContext> {
    let format = "#{pane_id}\t#{pane_in_mode}\t#{pane_width}\t#{pane_height}\t#{pane_current_path}";
    let output = tmux(&s(&["display-message", "-p", "-t", pane_id, format]))
        .map_err(|error| anyhow!("tmux-fuzzy-motion: pane not found: {error}"))?;
    let parts: Vec<&str> = output.trim().split('\t').collect();
    if parts.len() < 5 {
        bail!("tmux-fuzzy-motion: failed to resolve pane context");
    }
    Ok(PaneStartContext {
        pane_id: parts[0].to_string(),
        in_copy_mode: parts[1] == "1",
        width: parts[2].parse()?,
        height: parts[3].parse()?,
        current_path: parts[4].to_string(),
    })
}

pub fn list_window_panes(pane_id: &str) -> Result<Vec<WindowPaneContext>> {
    let format = "#{pane_id}\t#{pane_in_mode}\t#{pane_width}\t#{pane_height}\t#{pane_current_path}\t#{pane_left}\t#{pane_top}\t#{?pane_active,1,0}\t#{window_zoomed_flag}\t#{pane-border-lines}";
    let output = tmux(&s(&["list-panes", "-t", pane_id, "-F", format]))
        .map_err(|error| anyhow!("tmux-fuzzy-motion: pane not found: {error}"))?;
    let mut panes = Vec::new();
    let mut zoomed = false;
    for line in output.lines().filter(|line| !line.is_empty()) {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 10 {
            bail!("tmux-fuzzy-motion: failed to resolve window panes");
        }
        zoomed |= parts[8] == "1";
        panes.push((
            WindowPaneContext {
                pane_id: parts[0].to_string(),
                in_copy_mode: parts[1] == "1",
                width: parts[2].parse()?,
                height: parts[3].parse()?,
                current_path: parts[4].to_string(),
                left: parts[5].parse()?,
                top: parts[6].parse()?,
                active: parts[7] == "1",
                border_lines: parts[9].to_string(),
            },
            parts[8] == "1",
        ));
    }
    let filtered: Vec<WindowPaneContext> = panes
        .into_iter()
        .filter_map(|(pane, _)| (!zoomed || pane.active).then_some(pane))
        .collect();
    if filtered.is_empty() {
        bail!("tmux-fuzzy-motion: pane not found");
    }
    Ok(filtered)
}

pub fn enter_copy_mode(pane_id: &str) -> Result<()> {
    tmux(&s(&["copy-mode", "-t", pane_id]))
        .map_err(|error| anyhow!("tmux-fuzzy-motion: failed to enter copy-mode: {error}"))?;
    Ok(())
}

pub fn exit_copy_mode(pane_id: &str) -> Result<()> {
    tmux(&s(&["send-keys", "-X", "-t", pane_id, "cancel"]))
        .map_err(|error| anyhow!("tmux-fuzzy-motion: failed to exit copy-mode: {error}"))?;
    Ok(())
}
