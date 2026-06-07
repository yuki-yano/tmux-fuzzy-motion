use anyhow::{Result, bail};
use regex::Regex;

use crate::tmux::{s, tmux};

pub fn run_doctor() -> Result<()> {
    let version = tmux(&s(&["-V"]))?;
    let version = version.trim();
    println!("tmux: {version}");
    let re = Regex::new(r"tmux\s+(\d+)\.(\d+)").unwrap();
    let Some(captures) = re.captures(version) else {
        bail!("tmux-fuzzy-motion: failed to parse tmux version");
    };
    let major = captures[1].parse::<u32>()?;
    let minor = captures[2].parse::<u32>()?;
    if major < 3 || (major == 3 && minor < 2) {
        bail!("tmux-fuzzy-motion: tmux 3.2 or later is required");
    }
    println!("display-popup: ok");
    println!("runtime: rust");
    Ok(())
}
