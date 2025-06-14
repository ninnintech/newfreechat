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

### 5. プロンプトとAPIキーの安全な設定

#### プロンプトファイルの作成
```bash
# プロンプトファイルを作成（Gitで追跡されません）
cp prompts/characters.json.example prompts/characters.json
# エディタでプロンプトを編集
```

#### APIキーの安全な設定
```bash
# 対話式でAPIキーを設定（推奨）
npm run setup-secrets

# または手動で設定
wrangler kv:key put "venice_api_key" "your-venice-ai-api-key" --binding CHAT_KV --preview false
wrangler kv:key put "venice_api_key" "your-venice-ai-api-key" --binding CHAT_KV --preview
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

## セキュリティ

### 🔒 秘匿情報の管理

**APIキー:**
- ✅ Cloudflare KVに暗号化保存
- ✅ サーバーサイドでのみアクセス
- ❌ クライアントサイドに露出なし

**プロンプト:**
- ✅ Cloudflare KVに保存
- ✅ 外部ファイルで管理（Git追跡外）
- ❌ ソースコードに直接記載なし

**会話履歴:**
- ✅ ユーザーごとに分離
- ✅ 24時間TTLで自動削除
- ✅ フィンガープリントベースの匿名化

### 🛡️ セキュリティベストプラクティス

1. **APIキーの保護:**
   ```bash
   # ❌ 絶対にしないこと
   const API_KEY = "sk-xxx"; // コードに直接記載

   # ✅ 正しい方法
   const apiKey = await env.CHAT_KV.get('venice_api_key');
   ```

2. **プロンプトの保護:**
   ```bash
   # ❌ 避けるべき
   const prompt = "秘密のプロンプト"; // コードに直接記載

   # ✅ 推奨方法
   const prompt = await env.CHAT_KV.get('character:A');
   ```

3. **環境分離:**
   - 開発環境: Preview KV
   - 本番環境: Production KV
   - 異なるAPIキーとプロンプトを使用

## 注意事項

- Venice AI APIキーは必ずKVストアに保存し、コードにハードコーディングしないでください
- プロンプトファイルは.gitignoreに追加し、バージョン管理から除外してください
- 本番環境では適切なドメインとCORS設定を行ってください
- 画像ファイルは著作権に注意して使用してください

## ライセンス

ISC
