# AIキャラクターチャットサービス

Cloudflare Workersを使用したAIキャラクターとのチャットサービスです。

## 機能

- 3人のAIキャラクターとのチャット
- 1日20回までの利用制限
- ブラウザフィンガープリントによるユーザー識別
- 会話履歴の保存（最大5往復）
- レスポンシブデザイン
- 広告表示

## 技術スタック

- **バックエンド**: Cloudflare Workers
- **データストア**: Cloudflare KV
- **AI API**: Venice.ai (venice-uncensored model)
- **フロントエンド**: Vanilla JavaScript, HTML, CSS
- **フィンガープリント**: FingerprintJS

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Cloudflare KVネームスペースの作成

```bash
# KVネームスペースを作成
wrangler kv:namespace create "CHAT_KV"
wrangler kv:namespace create "CHAT_KV" --preview

# 出力されたIDをwrangler.tomlに設定
```

### 3. wrangler.tomlの設定

`wrangler.toml`ファイルのKVネームスペースIDを更新してください：

```toml
[[kv_namespaces]]
binding = "CHAT_KV"
id = "your-actual-kv-namespace-id"
preview_id = "your-actual-preview-kv-namespace-id"
```

### 4. 静的ファイルとプロンプトのアップロード

```bash
npm run upload-static
```

### 5. Venice AI APIキーの設定

```bash
wrangler kv:key put "venice_api_key" "your-venice-ai-api-key" --binding CHAT_KV
```

### 6. キャラクター画像の配置

`public/images/`フォルダに以下の画像を配置してください：

- `character-a.jpg` - あかり（明るく元気な女の子）
- `character-b.jpg` - みゆき（クールで少しミステリアスな女の子）
- `character-c.jpg` - さくら（優しくおっとりしたお姉さん）

推奨サイズ: 400x400px以上

### 7. 開発サーバーの起動

```bash
npm run dev
```

### 8. デプロイ

```bash
npm run deploy
```

## ディレクトリ構造

```
chatfreeAI/
├── src/
│   └── worker.js          # Cloudflare Worker メインファイル
├── public/
│   ├── index.html         # トップページ
│   ├── chat.html          # チャット画面
│   ├── terms.html         # 利用規約
│   ├── privacy.html       # プライバシーポリシー
│   ├── css/
│   │   └── style.css      # スタイルシート
│   ├── js/
│   │   └── app.js         # フロントエンドJavaScript
│   └── images/
│       └── (キャラクター画像)
├── scripts/
│   └── upload-static.js   # 静的ファイルアップロードスクリプト
├── wrangler.toml          # Cloudflare設定
└── package.json
```

## API仕様

### POST /api/chat

チャットメッセージを送信します。

**リクエスト:**
```json
{
  "characterId": "A",
  "userMessage": "こんにちは！",
  "fingerprint": "user-fingerprint-hash"
}
```

**レスポンス:**
```json
{
  "message": "こんにちは♪ 今日はどんなお話をしましょうか？",
  "remainingChats": 19
}
```

## キャラクター

### あかり (ID: A)
- 明るく元気な女の子
- 前向きで話し相手を元気づける
- 語尾に「♪」や「！」をつける

### みゆき (ID: B)  
- クールで少しミステリアスな女の子
- 知的で落ち着いている
- やや大人びた口調

### さくら (ID: C)
- 優しくおっとりしたお姉さん
- 包容力があり共感力が高い
- 丁寧語で温かみのある話し方

## 利用制限

- 1日20回までのチャット制限
- ブラウザフィンガープリントによる識別
- 日次リセット（24時間TTL）

## 広告設置

- トップページ: DMMウィジェット
- チャット画面（スマホ）: 下部にDMMウィジェット  
- チャット画面（PC）: 左右にDMMウィジェットとDLsiteランキング

## 注意事項

- Venice AI APIキーは必ずKVストアに保存し、コードにハードコーディングしないでください
- 本番環境では適切なドメインとCORS設定を行ってください
- 画像ファイルは著作権に注意して使用してください

## ライセンス

ISC
