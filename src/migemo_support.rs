use std::sync::OnceLock;

use regex::Regex;

use crate::migemo::{
    compact_dictionary::CompactDictionary, query::query, regex_generator::RegexOperator,
};

const MIGEMO_DICT_BYTES: &[u8] = include_bytes!("../assets/migemo-compact-dict");

fn dictionary() -> &'static CompactDictionary {
    static DICTIONARY: OnceLock<CompactDictionary> = OnceLock::new();
    DICTIONARY.get_or_init(|| {
        let bytes = MIGEMO_DICT_BYTES.to_vec();
        CompactDictionary::new(&bytes)
    })
}

pub fn build_regex(query_text: &str) -> Option<Regex> {
    if !query_text.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return None;
    }
    let pattern = query(
        query_text.to_ascii_lowercase(),
        dictionary(),
        &RegexOperator::Default,
    );
    if pattern.is_empty() {
        return None;
    }
    Regex::new(&pattern).ok()
}
