use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::doctor::run_doctor;
use crate::popup::{run_popup, run_popup_live};
use crate::start::run_start;
use crate::types::ScopeArg;

#[derive(Parser)]
#[command(name = "tmux-fuzzy-motion")]
#[command(about = "Fuzzy hint motion for tmux copy-mode")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Start {
        #[arg(long, value_enum, default_value_t = ScopeArg::Current)]
        scope: ScopeArg,
        pane_id: String,
        client_tty: String,
    },
    Popup {
        #[arg(long)]
        state_file: PathBuf,
        #[arg(long)]
        result_file: PathBuf,
    },
    PopupLive {
        pane_id: String,
    },
    Doctor,
}

pub fn run() -> Result<()> {
    match Cli::parse().command {
        Commands::Start {
            scope,
            pane_id,
            client_tty,
        } => run_start(scope, pane_id, client_tty),
        Commands::Popup {
            state_file,
            result_file,
        } => run_popup(state_file, result_file),
        Commands::PopupLive { pane_id } => run_popup_live(pane_id),
        Commands::Doctor => run_doctor(),
    }
}
