# Copilot Context Analyzer

<img src="icon.png" width="64" alt="icon" />

GitHub Copilot のセッションログを解析し、コンテキストの無駄遣いを可視化する VS Code 拡張機能です。

---

## 概要

GitHub Copilot Chat のデバッグログ（`debug-logs/`）を読み取り、[6つの最適化習慣](#6つの習慣)に基づいてセッションを分析します。
AIクレジットの消費状況、キャッシュ効率、ツール利用率などをサイドパネルで確認できます。

![screenshot](https://raw.githubusercontent.com/kouboyz/copilot-analyzer/main/docs/screenshot.png)

---

## 機能

### セッション一覧

> ℹ️ 2026年6月1日以前のセッションは表示されません。
> GitHub Copilot の新料金モデル（2026年6月〜）に基づくデータのみを対象としています。

- プロジェクト名・セッションタイトルの表示
- ターン数・入力トークン・キャッシュ率・ツール利用率・AIクレジットを色分け表示
- プロジェクト・期間によるフィルタリング
- 表示中セッションの集計（合計クレジット・平均キャッシュ率など）

### セッション詳細
- 各メトリクスと対応する習慣番号の表示
- カスタム指示ファイル（`CLAUDE.md`、`copilot-instructions.md` など）の行数・トークン数
- 使用ツール / 未使用ツールの一覧
- AIクレジット内訳（モデル別）
- LLMリクエスト内訳（目的・モデル・入出力トークン・キャッシュ率）

### その他
- 日本語 / 英語の切り替え（画面内トグル）
- `↺ Refresh` ボタンで再読み込み

---

## 前提条件

GitHub Copilot のデバッグログを有効化する必要があります。

VS Code の設定（`Ctrl+,` / `Cmd+,`）で `agentDebugLog` と検索し、**「GitHub Copilot Chat › Agent Debug Log: File Logging Enabled」** にチェックを入れてください。

または `settings.json` に以下を追加してください：

```json
"github.copilot.chat.agentDebugLog.fileLogging.enabled": true
```

設定後に Copilot Chat を使用すると、ログが自動生成されます。

---

## インストール

### VS Code Marketplace から（推奨）

VS Code の拡張機能パネルで `Copilot Context Analyzer` を検索してインストールしてください。

または [Marketplace ページ](https://marketplace.visualstudio.com/items?itemName=kouboyz.copilot-analyzer) から直接インストールできます。

### VSIX ファイルから

1. [Releases](https://github.com/kouboyz/copilot-analyzer/releases) から最新の `.vsix` をダウンロード
2. VS Code で `Extensions: Install from VSIX...` を実行して選択

---

## 6つの習慣

本ツールは以下の習慣に基づいて分析を行います。

| # | 習慣 | 指標 | 分析可否 |
|---|------|------|---------|
| 1 | Auto Mode を有効化 | — | ✗ ログに記録されないため対象外 |
| 2 | 最小スコープで送信 | 入力トークン数・平均入力/ターン | ✓ |
| 3 | 指示ファイルを短く保つ | キャッシュ率・指示ファイル行数 | ✓ |
| 4 | 推論努力を調整する | reasoning effort 設定 | ✓ |
| 5 | 不要ツールを無効化 | ツール利用率・未使用ツール一覧 | ✓ |
| 6 | タスク切替時に新チャット | ターン数・コンテキスト溢れ検出 | ✓ |

---

## AIクレジットについて

モデルの課金方式に応じて2通りで計算します。

- **multiplier 方式**（GPT-4.1 など）：`リクエスト数 × multiplier`
- **token_prices 方式**（GPT-5.3-Codex など）：`(入力トークン × input_price + キャッシュトークン × cache_price + 出力トークン × output_price) / batch_size`

> ⚠️ Auto Mode 選択による 10% 割引はログに記録されないため、表示値に含まれません。

---

## ログの保存場所

ログは以下のパスに保存されます（macOS）：

```
~/Library/Application Support/Code/User/workspaceStorage/{hash}/GitHub.copilot-chat/debug-logs/{sessionId}/
```

主なファイル：

| ファイル | 内容 |
|---------|------|
| `main.jsonl` | セッションイベント（LLMリクエスト、ツール呼び出しなど） |
| `models.json` | モデル一覧と課金情報 |
| `tools_N.json` | 定義済みツール一覧 |
| `system_prompt_N.json` | システムプロンプト |
| `title-*.jsonl` | セッションタイトル |

---

## 開発

```bash
git clone https://github.com/kouboyz/copilot-analyzer.git
cd copilot-analyzer
npm install
npm run compile   # ビルド
# F5 で拡張機能デバッグ起動
npm run package   # VSIX 生成
```

---

## ライセンス

[LICENSE](LICENSE) を参照してください。
