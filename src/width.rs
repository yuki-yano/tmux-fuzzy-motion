use regex::Regex;
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

const RESET: &str = "\x1b[0m";

pub fn compact_styled_display_cells(value: &str) -> Vec<String> {
    styled_cells(value, true)
}

pub fn styled_display_cells(value: &str) -> Vec<String> {
    styled_cells(value, false)
}

fn styled_cells(value: &str, compact: bool) -> Vec<String> {
    let ansi = Regex::new(r"\x1b\[[0-9;]*m").unwrap();
    let mut cells = Vec::new();
    let mut active_style = String::new();
    let mut pending_style = String::new();
    let mut style_open = false;
    let mut last_visible_cell = None;
    let mut last_index = 0;
    for matched in ansi.find_iter(value) {
        append_styled_chunk(
            &mut cells,
            &value[last_index..matched.start()],
            &active_style,
            &mut pending_style,
            &mut style_open,
            &mut last_visible_cell,
            compact,
        );
        let sequence = matched.as_str();
        if sequence == RESET {
            close_style(
                &mut cells,
                &mut active_style,
                &mut pending_style,
                &mut style_open,
                last_visible_cell,
                compact,
            );
        } else {
            active_style.push_str(sequence);
            pending_style.push_str(sequence);
        }
        last_index = matched.end();
    }
    append_styled_chunk(
        &mut cells,
        &value[last_index..],
        &active_style,
        &mut pending_style,
        &mut style_open,
        &mut last_visible_cell,
        compact,
    );
    if style_open {
        close_style(
            &mut cells,
            &mut active_style,
            &mut pending_style,
            &mut style_open,
            last_visible_cell,
            compact,
        );
    }
    cells
}

fn append_styled_chunk(
    cells: &mut Vec<String>,
    chunk: &str,
    active_style: &str,
    pending_style: &mut String,
    style_open: &mut bool,
    last_visible_cell: &mut Option<usize>,
    compact: bool,
) {
    for ch in chunk.chars() {
        let prefix = if compact {
            if !pending_style.is_empty() {
                std::mem::take(pending_style)
            } else if !*style_open && !active_style.is_empty() {
                active_style.to_string()
            } else {
                String::new()
            }
        } else {
            active_style.to_string()
        };
        let cell = if compact {
            format!("{prefix}{ch}")
        } else if prefix.is_empty() {
            ch.to_string()
        } else {
            format!("{prefix}{ch}{RESET}")
        };
        cells.push(cell);
        if !prefix.is_empty() {
            *style_open = true;
        }
        *last_visible_cell = Some(cells.len() - 1);
        for _ in 1..char_width(ch) {
            cells.push(String::new());
        }
    }
}

fn close_style(
    cells: &mut [String],
    active_style: &mut String,
    pending_style: &mut String,
    style_open: &mut bool,
    last_visible_cell: Option<usize>,
    compact: bool,
) {
    if compact
        && *style_open
        && let Some(index) = last_visible_cell
    {
        cells[index].push_str(RESET);
    }
    active_style.clear();
    pending_style.clear();
    *style_open = false;
}

pub fn display_width(value: &str) -> usize {
    UnicodeWidthStr::width(value)
}

pub fn char_width(ch: char) -> usize {
    UnicodeWidthChar::width(ch).unwrap_or(1).max(1)
}

pub fn byte_index_to_column(value: &str, byte_index: usize) -> usize {
    display_width(value.get(..byte_index).unwrap_or(value))
}

pub fn byte_index_to_char_index(value: &str, byte_index: usize) -> usize {
    value.get(..byte_index).unwrap_or(value).chars().count()
}
