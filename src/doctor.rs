use anyhow::{Result, bail};
use regex::Regex;

use crate::tmux::{s, tmux};

pub fn run_doctor() -> Result<()> {
    let version = tmux(&s(&["-V"]))?;
    let version = version.trim();
    println!("tmux: {version}");
    check_tmux_version(version)?;
    println!("display-popup: ok");
    println!("runtime: rust");
    Ok(())
}

fn check_tmux_version(version: &str) -> Result<()> {
    let re = Regex::new(r"^tmux\s+(?:next-)?([0-9]+)\.([0-9]+)[a-z]?$").unwrap();
    let Some(captures) = re.captures(version) else {
        bail!("tmux-fuzzy-motion: failed to parse tmux version");
    };
    let major = captures[1].parse::<u32>()?;
    let minor = captures[2].parse::<u32>()?;
    if major < 3 || (major == 3 && minor < 2) {
        bail!("tmux-fuzzy-motion: tmux 3.2 or later is required");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::check_tmux_version;

    #[test]
    fn accepts_supported_tmux_versions() {
        for version in [
            "tmux 3.2",
            "tmux 3.7c",
            "tmux next-3.9",
            "tmux 3.10",
            "tmux 4.0",
        ] {
            assert!(check_tmux_version(version).is_ok(), "{version}");
        }
    }

    #[test]
    fn rejects_tmux_versions_below_minimum() {
        for version in ["tmux 3.1", "tmux 2.9", "tmux 3.1c", "tmux next-3.1"] {
            let error = check_tmux_version(version).unwrap_err();
            assert_eq!(
                error.to_string(),
                "tmux-fuzzy-motion: tmux 3.2 or later is required",
                "{version}"
            );
        }
    }

    #[test]
    fn rejects_invalid_tmux_versions() {
        for version in [
            "",
            "tmux",
            "3.9",
            "not-tmux 3.9",
            "tmux next-3",
            "tmux 3.7unknown",
            "tmux 3.7c extra",
            "tmux next-3.9-extra",
        ] {
            let error = check_tmux_version(version).unwrap_err();
            assert_eq!(
                error.to_string(),
                "tmux-fuzzy-motion: failed to parse tmux version",
                "{version}"
            );
        }
    }
}
