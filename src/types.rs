use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, clap::ValueEnum)]
pub enum ScopeArg {
    Current,
    All,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Current,
    All,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screen_line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screen_col: Option<usize>,
    pub kind: String,
    pub text: String,
    pub line: usize,
    pub col: usize,
    pub end_col: usize,
    pub char_col: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchTarget {
    #[serde(flatten)]
    pub candidate: Candidate,
    pub positions: Vec<usize>,
    pub primary: usize,
    pub primary_char: usize,
    pub score: i64,
    pub hint: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaneSnapshot {
    pub pane_id: String,
    pub in_copy_mode: bool,
    pub width: usize,
    pub height: usize,
    pub left: usize,
    pub top: usize,
    pub plain_lines: Vec<String>,
    pub display_lines: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputState {
    pub scope: Scope,
    pub pane_id: String,
    pub client_tty: String,
    pub display_lines: Vec<String>,
    #[serde(default)]
    pub plain_lines: Vec<String>,
    pub width: usize,
    pub height: usize,
    #[serde(default)]
    pub panes: Vec<PaneSnapshot>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum InputResult {
    Cancelled,
    Selected { target: Box<MatchTarget> },
}

#[derive(Clone)]
pub struct PaneCapture {
    pub lines: Vec<String>,
    pub display_lines: Vec<String>,
}

#[derive(Clone)]
pub struct PaneStartContext {
    pub pane_id: String,
    pub in_copy_mode: bool,
    pub width: usize,
    pub height: usize,
    pub current_path: String,
}

#[derive(Clone)]
pub struct WindowPaneContext {
    pub pane_id: String,
    pub in_copy_mode: bool,
    pub width: usize,
    pub height: usize,
    pub current_path: String,
    pub left: usize,
    pub top: usize,
    pub active: bool,
    pub border_lines: String,
}

pub struct PopupState {
    pub current_path: String,
    pub state: InputState,
    pub x: Option<String>,
    pub y: Option<String>,
}
