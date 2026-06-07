mod action;
mod capture;
mod cli;
mod doctor;
mod extract;
mod matcher;
mod migemo;
mod migemo_support;
mod overlay;
mod popup;
mod start;
mod tmux;
mod types;
mod width;

fn main() {
    if let Err(error) = cli::run() {
        eprintln!("{error}");
        std::process::exit(if error.to_string().starts_with("tmux-fuzzy-motion:") {
            2
        } else {
            1
        });
    }
}
