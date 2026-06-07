use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use crate::types::Candidate;
use crate::width::{byte_index_to_char_index, byte_index_to_column, display_width};

static CANDIDATE_REGEXES: LazyLock<Vec<(&'static str, Regex)>> = LazyLock::new(|| {
    [
        ("url", r#"https?://[^\s\])'">]+"#),
        ("path", r#"(?:~/|/|\./|\.\./)[^\s"'`]+"#),
        ("filename", r#"\b[\w.-]+\.[A-Za-z0-9]{1,10}\b"#),
        ("symbol", r#"\b[A-Za-z_][A-Za-z0-9_:-]*[A-Za-z0-9_]\b"#),
        (
            "word",
            r#"[\p{L}\p{N}][\p{L}\p{N}._-]*[\p{L}\p{N}]|[\p{L}\p{N}]"#,
        ),
    ]
    .into_iter()
    .map(|(kind, pattern)| (kind, Regex::new(pattern).unwrap()))
    .collect()
});

pub fn extract_candidates(lines: &[String]) -> Vec<Candidate> {
    let mut collected = Vec::new();
    for (line_index, line) in lines.iter().enumerate() {
        let mut line_candidates = Vec::<(Candidate, usize, usize, usize)>::new();
        for (priority, (kind, regex)) in CANDIDATE_REGEXES.iter().enumerate() {
            for matched in regex.find_iter(line) {
                let text = matched.as_str().to_string();
                let width = display_width(&text);
                if width == 1 && *kind != "word" {
                    continue;
                }
                let col = byte_index_to_column(line, matched.start());
                line_candidates.push((
                    Candidate {
                        pane_id: None,
                        screen_line: None,
                        screen_col: None,
                        kind: (*kind).to_string(),
                        text,
                        line: line_index + 1,
                        col,
                        end_col: col + width,
                        char_col: byte_index_to_char_index(line, matched.start()),
                    },
                    priority,
                    matched.start(),
                    matched.end(),
                ));
            }
        }
        collected.extend(dedupe_line_candidates(line_candidates));
    }
    collected.sort_by(|left, right| {
        left.line
            .cmp(&right.line)
            .then(left.col.cmp(&right.col))
            .then(left.kind.cmp(&right.kind))
    });
    collected
}

fn dedupe_line_candidates(candidates: Vec<(Candidate, usize, usize, usize)>) -> Vec<Candidate> {
    let mut by_start: HashMap<usize, (Candidate, usize, usize, usize)> = HashMap::new();
    for item in candidates {
        match by_start.get(&item.2) {
            Some(existing) if existing.1 <= item.1 => {}
            _ => {
                by_start.insert(item.2, item);
            }
        }
    }
    let deduped: Vec<_> = by_start.into_values().collect();
    deduped
        .iter()
        .filter(|(candidate, priority, start, end)| {
            !deduped
                .iter()
                .any(|(other, other_priority, other_start, other_end)| {
                    other.line == candidate.line
                        && other_priority < priority
                        && other_start <= start
                        && other_end >= end
                })
        })
        .map(|(candidate, _, _, _)| candidate.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_urls_paths_symbols_and_words() {
        let lines = vec![
            "open https://example.com/a and ./src/main.rs".to_string(),
            "call foo_bar baz".to_string(),
        ];
        let candidates = extract_candidates(&lines);
        assert!(candidates.iter().any(|item| item.kind == "url"));
        assert!(candidates.iter().any(|item| item.kind == "path"));
        assert!(
            candidates
                .iter()
                .any(|item| item.kind == "symbol" && item.text == "foo_bar")
        );
    }
}
