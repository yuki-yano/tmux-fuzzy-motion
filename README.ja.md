# tmux-fuzzy-motion

[English README](./README.md)

`tmux-fuzzy-motion` は、tmux pane 内で素早くカーソル移動するための CLI です。
現在の viewport からジャンプ対象を抽出し、fuzzy search で絞り込み、
大文字の hint で移動できます。

## 特徴

- `tmux copy-mode` 内で動作
- `start` は copy mode の外から起動しても自動で copy mode に入る
- `start --scope all` は current window の visible pane 全体を対象にできる
- 現在の viewport から URL、path、filename、symbol、一般的な単語を抽出
- Rust 実装の built-in fuzzy match と Migemo によるローマ字日本語検索
- overlay 描画時も pane の色を維持
- 単一キーの大文字 hint で素早く選択
- UI は tmux popup で表示し、常駐用の scratch window を作らない

## 動作要件

- crates.io からの install に Rust/Cargo
- tmux 3.2 以上

## インストール

```bash
cargo install tmux-fuzzy-motion
```

インストール確認:

```bash
tmux-fuzzy-motion doctor
```

## tmux 設定

`tmux.conf` に次を追加してください。

```tmux
bind-key -T copy-mode-vi s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
bind-key -T copy-mode s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
```

copy mode の外からも起動したい場合は、root table にも bind を追加します。

```tmux
bind-key s run-shell 'tmux-fuzzy-motion start #{pane_id} #{client_tty}'
```

current window の visible pane 全体から選びたい場合は、`--scope all` を付けた bind を追加します。

```tmux
bind-key S run-shell 'tmux-fuzzy-motion start --scope all #{pane_id} #{client_tty}'
```

`start` サブコマンドを経由せずに tmux から直接 popup を開きたい場合は、次の設定も使えます。

```tmux
bind-key -T copy-mode-vi s run-shell -C "display-popup -E -B -x '##{popup_pane_left}' -y '##{popup_pane_top}' -w '#{pane_width}' -h '#{pane_height}' 'tmux-fuzzy-motion popup-live #{pane_id}'"
bind-key -T copy-mode s run-shell -C "display-popup -E -B -x '##{popup_pane_left}' -y '##{popup_pane_top}' -w '#{pane_width}' -h '#{pane_height}' 'tmux-fuzzy-motion popup-live #{pane_id}'"
```

> [!NOTE]
> 後述の手順の`2.`で`'tmux-fuzzy-motion start %25 /dev/ttys000' returned 127`のようなエラーが表示される場合は以下のようにrun-shell環境のPATHに`tmux-fuzzy-motion`を含める必要があります。
>
> ```tmux
> set-environment -g PATH "$HOME/.cargo/bin:$PATH"
> ```

設定変更後は tmux を reload します。

```bash
tmux source-file ~/.tmux.conf
```

## 使い方

1. `tmux-fuzzy-motion start` を bind したキーを押す
2. `--scope current`（default）は current pane のみを対象にし、pane がまだ `copy-mode` でなければ先に `copy-mode` に入る
3. `--scope all` は current window の visible pane 全体を popup に合成して対象にする
4. 小文字や記号で query を入力する
5. fuzzy match で候補を絞り込む。ローマ字 query は同梱 Migemo 辞書で日本語語句にも一致する
6. 大文字 hint を押して即座に移動する
7. `--scope all` で選択した場合は、該当 pane を active にして必要なら `copy-mode` に入ってから移動する
8. `Esc` または `Ctrl-[` でキャンセルする。`start` が current pane を `copy-mode` に入れた場合は、キャンセル時に `copy-mode` も抜ける

## 入力キー

- `A-Z`: 表示中の hint を即時選択
- `Enter`: 現在の先頭候補を選択
- `Esc`, `Ctrl-[`, `Ctrl-g`: キャンセル
- `Backspace`, `Ctrl-h`: 1 文字削除
- `Ctrl-w`: 直前の単語を削除
- `Ctrl-u`: query をすべて削除

## コマンド

```text
tmux-fuzzy-motion start [--scope current|all] <pane-id> <client-tty>
tmux-fuzzy-motion popup-live <pane-id>
tmux-fuzzy-motion doctor
```

`popup` は内部サブコマンドです。`popup-live` は `display-popup`
から直接起動する設定向けです。

`--scope`:

- `current`: current pane のみを対象にする。default
- `all`: current window の visible pane 全体を対象にする

## Doctor

ローカル環境の確認には `doctor` を使います。

```bash
tmux-fuzzy-motion doctor
```

確認内容:

- tmux の version
- Rust runtime build

## 開発

このリポジトリからローカル開発する場合:

```bash
cargo build
```

test:

```bash
cargo test
```

ローカルの一括確認:

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```

## third-party components

Migemo support には `oguna/rustmigemo` の source code と
`oguna/yet-another-migemo-dict` の compact dictionary を同梱しています。
license と出典の詳細は [NOTICE.md](./NOTICE.md) を参照してください。

## 制約

- 対象は各 pane の現在の viewport のみ
- `--scope all` の対象は current window の visible pane のみ
- zoom 中の `--scope all` は見えている pane のみを対象にする
- query 入力は ASCII 寄り
- combining character の完全な扱いは未保証
- `display-popup` が必要なため、tmux 3.2 以上が必須
- query は popup の最下行右端に描画する
