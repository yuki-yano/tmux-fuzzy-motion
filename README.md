# tmux-fuzzy-motion

`tmux copy-mode` 上で viewport 内の候補語を fuzzy match し、hint 選択でカーソル移動する CLI です。

## Requirements

- Node.js 22+
- tmux 3.2+
- pnpm

## Install

```bash
pnpm install
pnpm build
```

`dist/cli.js` は shebang 付きで出力されます。ローカル確認は `node dist/cli.js` でも実行できます。

## Build

```bash
pnpm build
```

## tmux.conf

```tmux
bind-key -T copy-mode-vi s run-shell -b 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
bind-key -T copy-mode s run-shell -b 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
```

## Usage

1. `copy-mode` に入る
2. `s` を押して popup を開く
3. query を入力して候補を絞り込む
4. `Enter` で hint 入力モードに入る
5. hint を入力してカーソルを移動する
6. `Esc` または `Ctrl-[` でキャンセルする

環境確認:

```bash
tmux-fuzzy-motion doctor
```

## Development

```bash
pnpm check
```

## Known Limitations

- 対象は現在 viewport のみ
- `copy-mode` 専用
- query 入力は ASCII 前提
- combining character の完全一致は未保証
