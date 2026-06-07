use std::collections::HashMap;

use crate::types::MatchTarget;
use crate::width::{display_width, styled_display_cells};

const RESET: &str = "\x1b[0m";
const PRIMARY_HINT_STYLE: &str = "\x1b[4;1;38;2;243;139;168m";
const PRIMARY_HIGHLIGHT_STYLE: &str = "\x1b[4;1;38;2;137;220;235m";
const SECONDARY_HINT_STYLE: &str = "\x1b[4;1;38;2;249;226;175m";
const SECONDARY_HIGHLIGHT_STYLE: &str = "\x1b[4;1;38;2;116;199;236m";

pub struct OverlayBase {
    lines: Vec<String>,
    cells_by_line: HashMap<usize, Vec<String>>,
}

impl OverlayBase {
    pub fn new(lines: &[String]) -> Self {
        let cells_by_line = lines
            .iter()
            .enumerate()
            .map(|(index, line)| (index, styled_display_cells(line)))
            .collect();
        Self {
            lines: lines.to_vec(),
            cells_by_line,
        }
    }

    pub fn render(&self, targets: &[MatchTarget]) -> Vec<String> {
        let mut rendered = self.lines.clone();
        let mut mutable_cells: HashMap<usize, Vec<String>> = HashMap::new();
        let mut occupied_by_line: HashMap<usize, Vec<bool>> = HashMap::new();
        let enter_target = targets.first();
        let mut sorted = targets.to_vec();
        sorted.sort_by(|left, right| {
            target_line(left)
                .cmp(&target_line(right))
                .then((target_col(left) + left.primary).cmp(&(target_col(right) + right.primary)))
        });
        for target in sorted {
            let line_index = target_line(&target);
            let Some(base_cells) = self.cells_by_line.get(&line_index) else {
                continue;
            };
            let cells = mutable_cells
                .entry(line_index)
                .or_insert_with(|| base_cells.clone());
            let occupied = occupied_by_line
                .entry(line_index)
                .or_insert_with(|| vec![false; base_cells.len()]);
            let match_col = target_col(&target) + target.primary;
            let hint_col = find_overlay_start(cells, match_col);
            let base_width = measure_cell_width(cells, hint_col);
            let padded_hint = if hint_col < match_col {
                format!("{:<width$}", target.hint, width = base_width)
            } else {
                target.hint.clone()
            };
            let hint_width = display_width(&padded_hint);
            let should_highlight_primary = hint_col < match_col;
            let highlight_cols: Vec<usize> = target
                .positions
                .iter()
                .copied()
                .filter(|position| *position != target.primary || should_highlight_primary)
                .map(|position| target_col(&target) + position)
                .collect();
            let is_enter_target = enter_target.is_some_and(|enter| same_target(enter, &target));
            let hint_style = if is_enter_target {
                PRIMARY_HINT_STYLE
            } else {
                SECONDARY_HINT_STYLE
            };
            let highlight_style = if is_enter_target {
                PRIMARY_HIGHLIGHT_STYLE
            } else {
                SECONDARY_HIGHLIGHT_STYLE
            };
            if (0..hint_width)
                .any(|offset| occupied.get(hint_col + offset).copied().unwrap_or(false))
                || highlight_cols
                    .iter()
                    .any(|col| occupied.get(*col).copied().unwrap_or(false))
            {
                continue;
            }
            if hint_col < cells.len() {
                cells[hint_col] = format!("{hint_style}{padded_hint}{RESET}");
                for offset in 0..hint_width {
                    if let Some(cell) = cells.get_mut(hint_col + offset)
                        && offset > 0
                    {
                        cell.clear();
                    }
                    if let Some(occupied_cell) = occupied.get_mut(hint_col + offset) {
                        *occupied_cell = true;
                    }
                }
            }
            for col in highlight_cols {
                if let Some(cell) = cells.get_mut(col)
                    && !cell.is_empty()
                {
                    *cell = format!("{highlight_style}{cell}{RESET}");
                    if let Some(occupied_cell) = occupied.get_mut(col) {
                        *occupied_cell = true;
                    }
                }
            }
        }
        for (line_index, cells) in mutable_cells {
            if let Some(line) = rendered.get_mut(line_index) {
                *line = cells.join("");
            }
        }
        rendered
    }
}

fn target_line(target: &MatchTarget) -> usize {
    target
        .candidate
        .screen_line
        .unwrap_or(target.candidate.line)
        .saturating_sub(1)
}

fn target_col(target: &MatchTarget) -> usize {
    target.candidate.screen_col.unwrap_or(target.candidate.col)
}

fn same_target(left: &MatchTarget, right: &MatchTarget) -> bool {
    left.candidate.pane_id == right.candidate.pane_id
        && target_line(left) == target_line(right)
        && target_col(left) == target_col(right)
        && left.candidate.text == right.candidate.text
}

fn find_overlay_start(cells: &[String], match_col: usize) -> usize {
    if match_col == 0 {
        return 0;
    }
    let mut start = match_col - 1;
    while start > 0 && cells.get(start).is_some_and(|cell| cell.is_empty()) {
        start -= 1;
    }
    start
}

fn measure_cell_width(cells: &[String], start: usize) -> usize {
    let mut width = 1;
    while start + width < cells.len() && cells[start + width].is_empty() {
        width += 1;
    }
    width
}
