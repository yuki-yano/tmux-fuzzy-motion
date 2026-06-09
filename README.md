# tmux-fuzzy-motion

[日本語版はこちら](./README.ja.md)

`tmux-fuzzy-motion` is a CLI for quick cursor jumps in tmux panes.
It scans the current viewport, extracts jump targets, filters them with fuzzy
search, and lets you jump with uppercase hints.

## Features

- Works inside `tmux copy-mode`
- `start` can also be launched outside copy-mode and enters copy-mode automatically
- `start --scope all` can target every visible pane in the current window
- Extracts URLs, paths, filenames, symbols, and general words from the current viewport
- Supports fast built-in fuzzy matching and Migemo-powered romaji search
- Preserves pane colors while drawing the overlay
- Uses single-key uppercase hints for fast selection
- Opens the UI in a tmux popup instead of creating a persistent scratch window

## Requirements

- Rust/Cargo for installation from crates.io
- tmux 3.2 or later

## Install

```bash
cargo install tmux-fuzzy-motion
```

Verify the installation:

```bash
tmux-fuzzy-motion doctor
```

## tmux Configuration

Add these bindings to your `tmux.conf`:

```tmux
bind-key -T copy-mode-vi s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
bind-key -T copy-mode s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
```

If you also want to launch it outside copy-mode, add a binding in the root
table as well:

```tmux
bind-key s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
```

If you want to search across every visible pane in the current window, add a
binding with `--scope all`.

```tmux
bind-key S run-shell 'tmux-fuzzy-motion start --scope all #{pane_id} #{client_tty}'
```

If you want tmux to open the popup directly without going through the `start`
subcommand, use this instead:

```tmux
bind-key -T copy-mode-vi s run-shell -C "display-popup -E -B -x '##{popup_pane_left}' -y '##{popup_pane_top}' -w '#{pane_width}' -h '#{pane_height}' 'tmux-fuzzy-motion popup-live #{pane_id}'"
bind-key -T copy-mode s run-shell -C "display-popup -E -B -x '##{popup_pane_left}' -y '##{popup_pane_top}' -w '#{pane_width}' -h '#{pane_height}' 'tmux-fuzzy-motion popup-live #{pane_id}'"
```

> [!NOTE]
> If you see an error like `'tmux-fuzzy-motion start %25 /dev/ttys000' returned 127` at step 2 below, you need to add `tmux-fuzzy-motion` to the PATH in the run-shell environment:
>
> ```tmux
> set-environment -g PATH "$HOME/.cargo/bin:$PATH"
> ```

Reload tmux after editing the config:

```bash
tmux source-file ~/.tmux.conf
```

## Usage

1. Press the key bound to `tmux-fuzzy-motion start`.
2. `--scope current` (the default) targets only the current pane and enters
   copy-mode first if needed.
3. `--scope all` targets every visible pane in the current window by composing
   them into a single popup.
4. Type a query in lowercase or symbols.
5. Narrow the candidates with fuzzy matching. Romaji queries can also match
   Japanese words through the bundled Migemo dictionary.
6. Press an uppercase hint to jump immediately.
7. In `--scope all`, the selected pane becomes active and enters copy-mode if
   needed before the cursor moves.
8. Press `Esc` or `Ctrl-[` to cancel. If `start` entered copy-mode for the
   current pane, cancel exits copy-mode as well.

## Input Keys

- `A-Z`: select a visible hint immediately
- `Enter`: select the first visible match
- `Esc`, `Ctrl-[`, `Ctrl-g`: cancel
- `Backspace`, `Ctrl-h`: delete one character
- `Ctrl-w`: delete the previous word
- `Ctrl-u`: clear the whole query

## Commands

```text
tmux-fuzzy-motion start [--scope current|all] <pane-id> <client-tty>
tmux-fuzzy-motion popup-live <pane-id>
tmux-fuzzy-motion doctor
```

`popup` is an internal subcommand. `popup-live` is intended for direct
`display-popup` bindings.

`--scope`:

- `current`: target only the current pane. This is the default.
- `all`: target every visible pane in the current window.

## Doctor

Use `doctor` to verify the local environment:

```bash
tmux-fuzzy-motion doctor
```

It checks:

- tmux version
- Rust runtime build

## Development

For local development from this repository:

```bash
cargo build
```

Run tests:

```bash
cargo test
```

Run the full local check:

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```

## Third-party components

Migemo support uses source code from `oguna/rustmigemo` and a bundled compact
dictionary from `oguna/yet-another-migemo-dict`. See [NOTICE.md](./NOTICE.md)
for license and provenance details.

## Limitations

- Targets are limited to the current viewport of each pane
- `--scope all` targets only visible panes in the current window
- Zoomed windows with `--scope all` only target the pane that is visible
- Query input is ASCII-oriented
- Exact behavior for combining characters is not fully guaranteed
- Requires `display-popup`, so tmux 3.2 or later is mandatory
- The query is drawn on the popup's bottom row, aligned to the right edge
