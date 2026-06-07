use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use crate::types::{Candidate, MatchTarget};
use crate::width::{byte_index_to_char_index, byte_index_to_column};

const HINT_CHARS: &[u8] = b"ASDFGHJKLQWERTYUIOPZXCVBNM";

pub fn match_candidates(candidates: &[Candidate], query: &str) -> Vec<MatchTarget> {
    let mut matches = Vec::new();
    let mut matched_keys = HashSet::new();
    for candidate in candidates {
        if let Some((positions, raw_positions, score)) = fuzzy_positions(&candidate.text, query) {
            let primary = positions.first().copied().unwrap_or(0);
            let primary_char = byte_index_to_char_index(
                &candidate.text,
                raw_positions.first().copied().unwrap_or(0),
            );
            matched_keys.insert(candidate_key(candidate));
            matches.push(MatchTarget {
                candidate: candidate.clone(),
                positions,
                primary,
                primary_char,
                score,
                hint: String::new(),
            });
        }
    }
    if let Some(migemo_regex) = crate::migemo_support::build_regex(query) {
        for candidate in candidates {
            if matched_keys.contains(&candidate_key(candidate)) {
                continue;
            }
            let Some(matched) = migemo_regex.find(&candidate.text) else {
                continue;
            };
            let positions = match_positions(&candidate.text, matched.start(), matched.end());
            if positions.is_empty() {
                continue;
            }
            let primary = positions[0];
            let primary_char = byte_index_to_char_index(&candidate.text, matched.start());
            let score = -1_000_000 - candidate.text.chars().count() as i64;
            matches.push(MatchTarget {
                candidate: candidate.clone(),
                positions,
                primary,
                primary_char,
                score,
                hint: String::new(),
            });
        }
    }
    matches.sort_by(compare_matches);
    matches
}

fn match_positions(value: &str, start: usize, end: usize) -> Vec<usize> {
    value[start..end]
        .char_indices()
        .map(|(offset, _)| byte_index_to_column(value, start + offset))
        .collect()
}

fn fuzzy_positions(value: &str, query: &str) -> Option<(Vec<usize>, Vec<usize>, i64)> {
    let value_lower = value.to_lowercase();
    let query_lower = query.to_lowercase();
    let mut positions = Vec::new();
    let mut raw_positions = Vec::new();
    let mut search_from = 0;
    for query_char in query_lower.chars() {
        let mut found = None;
        for (offset, value_char) in value_lower[search_from..].char_indices() {
            if value_char == query_char {
                found = Some(search_from + offset);
                break;
            }
        }
        let index = found?;
        raw_positions.push(index);
        positions.push(byte_index_to_column(value, index));
        search_from = index + value_lower[index..].chars().next()?.len_utf8();
    }
    let consecutive_bonus = raw_positions
        .windows(2)
        .filter(|window| {
            window[1] == window[0] + value[window[0]..].chars().next().unwrap().len_utf8()
        })
        .count() as i64
        * 10;
    let start_bonus = if raw_positions.first() == Some(&0) {
        20
    } else {
        0
    };
    let score = 1000 + consecutive_bonus + start_bonus - value.chars().count() as i64;
    Some((positions, raw_positions, score))
}

fn compare_matches(left: &MatchTarget, right: &MatchTarget) -> Ordering {
    right
        .score
        .cmp(&left.score)
        .then(left.candidate.line.cmp(&right.candidate.line))
        .then(left.candidate.col.cmp(&right.candidate.col))
        .then(left.candidate.text.len().cmp(&right.candidate.text.len()))
}

pub fn assign_hints(
    targets: Vec<MatchTarget>,
    previous_hints: &HashMap<String, String>,
) -> Vec<MatchTarget> {
    let mut used = HashSet::new();
    let mut result = Vec::new();
    for mut target in targets.into_iter().take(26) {
        let key = candidate_key(&target.candidate);
        if let Some(previous) = previous_hints.get(&key)
            && previous.len() == 1
            && !used.contains(previous)
        {
            used.insert(previous.clone());
            target.hint = previous.clone();
            result.push(target);
            continue;
        }
        if let Some(ch) = HINT_CHARS
            .iter()
            .map(|value| (*value as char).to_string())
            .find(|hint| !used.contains(hint))
        {
            used.insert(ch.clone());
            target.hint = ch;
            result.push(target);
        }
    }
    result
}

pub fn candidate_key(candidate: &Candidate) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}",
        candidate.pane_id.clone().unwrap_or_default(),
        candidate.kind,
        candidate.text,
        candidate.line,
        candidate.col,
        candidate.end_col
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(text: &str, line: usize) -> Candidate {
        Candidate {
            pane_id: None,
            screen_line: None,
            screen_col: None,
            kind: "word".to_string(),
            text: text.to_string(),
            line,
            col: 0,
            end_col: text.len(),
            char_col: 0,
        }
    }

    #[test]
    fn assigns_single_key_hints_stably() {
        let targets = vec![
            MatchTarget {
                candidate: candidate("alpha", 1),
                positions: vec![0],
                primary: 0,
                primary_char: 0,
                score: 10,
                hint: String::new(),
            },
            MatchTarget {
                candidate: candidate("beta", 2),
                positions: vec![0],
                primary: 0,
                primary_char: 0,
                score: 8,
                hint: String::new(),
            },
        ];
        let assigned = assign_hints(targets, &HashMap::new());
        assert_eq!(assigned[0].hint, "A");
        assert_eq!(assigned[1].hint, "S");
    }

    #[test]
    fn fuzzy_matching_keeps_columns() {
        let matches = match_candidates(&[candidate("foo_bar", 1)], "fb");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].positions, vec![0, 4]);
    }

    #[test]
    fn migemo_matching_finds_japanese_words() {
        let matches = match_candidates(&[candidate("検索", 1)], "kensaku");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].candidate.text, "検索");
        assert_eq!(matches[0].positions, vec![0, 2]);
    }

    #[test]
    fn migemo_matching_only_runs_for_plain_alpha_queries() {
        let matches = match_candidates(&[candidate("検索", 1)], "kensaku/");
        assert!(matches.is_empty());
    }

    #[test]
    fn fuzzy_matches_stay_before_migemo_only_matches() {
        let long_fuzzy = "a".repeat(2_000);
        let matches = match_candidates(&[candidate("検索", 1), candidate(&long_fuzzy, 2)], "a");
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].candidate.text, long_fuzzy);
    }
}
