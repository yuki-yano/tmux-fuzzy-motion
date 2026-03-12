# tmux-fuzzy-motion

[English README](./README.md)

`tmux-fuzzy-motion` は、`tmux copy-mode` 内で素早くカーソル移動するための
CLI です。現在の viewport からジャンプ対象を抽出し、fuzzy search で絞り込み、
大文字の hint で移動できます。英字のローマ字 query に対しては Migemo による
日本語マッチも行います。

## 特徴

- `tmux copy-mode` 内で動作
- 現在の viewport から URL、path、filename、symbol、一般的な単語を抽出
- `fzf` による fuzzy match
- `jsmigemo` による英字 query の Migemo マッチ
- overlay 描画時も pane の色を維持
- 単一キーの大文字 hint で素早く選択
- query は対象 pane 内に描画し、終了時に元の pane を復元

## 動作要件

- Node.js 22 以上
- tmux 3.2 以上

## インストール

```bash
npm install -g tmux-fuzzy-motion@latest
```

pnpm を使う場合:

```bash
pnpm add -g tmux-fuzzy-motion@latest
```

インストール確認:

```bash
tmux-fuzzy-motion doctor
```

グローバル install せずにその場で実行する場合:

```bash
npx tmux-fuzzy-motion@latest doctor
```

## tmux 設定

`tmux.conf` に次を追加してください。

```tmux
bind-key -T copy-mode-vi s run-shell -b 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
bind-key -T copy-mode s run-shell -b 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
```

設定変更後は tmux を reload します。

```bash
tmux source-file ~/.tmux.conf
```

## 使い方

1. `copy-mode` に入る
2. `s` を押す
3. 小文字や記号で query を入力する
4. fuzzy match で候補を絞り込む
5. 英字 query の場合は Migemo による日本語候補も対象になる
6. 大文字 hint を押して即座に移動する
7. `Esc` または `Ctrl-[` でキャンセルする

## 入力キー

- `A-Z`: 表示中の hint を即時選択
- `Enter`: 現在の先頭候補を選択
- `Esc`, `Ctrl-[`, `Ctrl-g`: キャンセル
- `Backspace`, `Ctrl-h`: 1 文字削除
- `Ctrl-w`: 直前の単語を削除
- `Ctrl-u`: query をすべて削除

## コマンド

```text
tmux-fuzzy-motion start <pane-id> <client-tty>
tmux-fuzzy-motion doctor
```

`input` は `start` から内部的に使うサブコマンドです。

## Doctor

ローカル環境の確認には `doctor` を使います。

```bash
tmux-fuzzy-motion doctor
```

確認内容:

- Node.js の version
- tmux の version
- Migemo 辞書の読み込み可否

## 開発

このリポジトリからローカル開発する場合:

```bash
pnpm install
```

この開発フローでは `pnpm` が必要です。

1 回 build:

```bash
pnpm build
```

watch build:

```bash
pnpm run dev
```

ローカルの一括確認:

```bash
pnpm check
```

## 制約

- 対象は現在の viewport のみ
- `copy-mode` 専用
- query 入力は ASCII 寄り
- combining character の完全な扱いは未保証
- overlay は一時的な tmux pane を swap して表示し、終了時に元へ戻す
- query は pane 内の最下行右端に描画する
