# tmux-fuzzy-motion

[日本語版はこちら](./README.ja.md)

`tmux-fuzzy-motion` is a CLI for quick cursor jumps inside `tmux copy-mode`.
It scans the current viewport, extracts jump targets, filters them with fuzzy
search, and lets you jump with uppercase hints. Roman queries can also match
Japanese text through Migemo.

## Features

- Works inside `tmux copy-mode`
- Extracts URLs, paths, filenames, symbols, and general words from the current viewport
- Supports fuzzy matching with `fzf`
- Supports Migemo matching for alphabetic queries via `jsmigemo`
- Preserves pane colors while drawing the overlay
- Reuses an external daemon process so matcher and Migemo startup stay warm
- Uses single-key uppercase hints for fast selection
- Opens the UI in a tmux popup instead of creating a persistent scratch window

## Requirements

- Node.js 22 or later
- tmux 3.2 or later

## Install

```bash
npm install -g tmux-fuzzy-motion@latest
```

If you prefer pnpm:

```bash
pnpm add -g tmux-fuzzy-motion@latest
```

Verify the installation:

```bash
tmux-fuzzy-motion doctor
```

You can also run it without a global install:

```bash
npx tmux-fuzzy-motion@latest doctor
```

## tmux Configuration

Add these bindings to your `tmux.conf`:

```tmux
bind-key -T copy-mode-vi s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
bind-key -T copy-mode s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
```

If you want tmux to open the popup directly without going through the `start`
subcommand, use this instead:

```tmux
bind-key -T copy-mode-vi s run-shell -C "display-popup -E -B -x '##{popup_pane_left}' -y '##{popup_pane_top}' -w '#{pane_width}' -h '#{pane_height}' 'tmux-fuzzy-motion popup-live #{pane_id}'"
bind-key -T copy-mode s run-shell -C "display-popup -E -B -x '##{popup_pane_left}' -y '##{popup_pane_top}' -w '#{pane_width}' -h '#{pane_height}' 'tmux-fuzzy-motion popup-live #{pane_id}'"
```

> [!NOTE]
> If you see an error like `'tmux-fuzzy-motion start %25 /dev/ttys000' returned 127` at step 2 below, you need to add `tmux-fuzzy-motion` to the PATH in the run-shell environment:
> ```tmux
> set-environment -g PATH "/path/to/node/bin:$PATH"
> ```

Reload tmux after editing the config:

```bash
tmux source-file ~/.tmux.conf
```

## Usage

1. Enter `copy-mode`.
2. Press `s`.
3. Type a query in lowercase or symbols.
4. Narrow the candidates with fuzzy matching.
5. For alphabetic queries, Migemo also expands roman input to Japanese matches.
6. Press an uppercase hint to jump immediately.
7. Press `Esc` or `Ctrl-[` to cancel.

## Input Keys

- `A-Z`: select a visible hint immediately
- `Enter`: select the first visible match
- `Esc`, `Ctrl-[`, `Ctrl-g`: cancel
- `Backspace`, `Ctrl-h`: delete one character
- `Ctrl-w`: delete the previous word
- `Ctrl-u`: clear the whole query

## Commands

```text
tmux-fuzzy-motion start <pane-id> <client-tty>
tmux-fuzzy-motion popup-live <pane-id>
tmux-fuzzy-motion doctor
```

`popup` and `daemon` are internal subcommands. `popup-live` is intended for
direct `display-popup` bindings.

## Doctor

Use `doctor` to verify the local environment:

```bash
tmux-fuzzy-motion doctor
```

It checks:

- Node.js version
- tmux version
- Migemo dictionary loading

## Development

For local development from this repository:

```bash
pnpm install
```

You will need `pnpm` for the development workflow above.

Build once:

```bash
pnpm build
```

Watch mode:

```bash
pnpm run dev
```

Run the full local check:

```bash
pnpm check
```

## Limitations

- Targets are limited to the current viewport
- Designed for `copy-mode` only
- Query input is ASCII-oriented
- Exact behavior for combining characters is not fully guaranteed
- Requires `display-popup`, so tmux 3.2 or later is mandatory
- The query is drawn on the bottom row inside the pane, aligned to the right edge
