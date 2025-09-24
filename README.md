# Shopify Customer Tag Trigger

Vercel上で動作するShopify Admin APIを使った軽量アプリ。顧客IDを受け取り、一時的にタグを付与して即座に削除するAPIエンドポイントを提供します。

## セットアップ

1. 依存関係をインストール:
```bash
npm install
```

2. 環境変数を設定:
`.env.local`ファイルに以下を設定:
```
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your-access-token
```

3. ローカル開発:
```bash
npm run dev
```

## API使用方法

### POST /api/customer-tag

顧客にタグを付与して即座に削除します。

**リクエスト:**
```json
{
  "customerId": 123456789,
  "tag": "temp-tag"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "Tag \"temp-tag\" was added and removed for customer 123456789",
  "customerId": 123456789,
  "tag": "temp-tag"
}
```

## Vercelデプロイ

1. Vercelアカウントでプロジェクトをインポート
2. 環境変数 `SHOPIFY_SHOP_DOMAIN` と `SHOPIFY_ACCESS_TOKEN` を設定
3. デプロイ完了

## バッチ処理スクリプト

全ての顧客に対して一括でcustomer-tag APIを呼び出すスクリプトを提供しています。

### 基本的な使用方法

1. **Next.jsアプリを起動（別ターミナル）:**
```bash
npm run dev
```

2. **通常実行（デフォルトタグ）:**
```bash
npm run batch-tag
```

3. **カスタムタグを指定:**
```bash
npm run batch-tag my-custom-tag
```

4. **デバッグモード（顧客詳細表示）:**
```bash
npm run batch-tag-debug
npm run batch-tag-debug my-custom-tag
```

### 直接コマンド実行

```bash
# 通常実行
node scripts/batch-customer-tag.js [tag-name]

# デバッグモード
node scripts/batch-customer-tag.js [tag-name] --debug
node scripts/batch-customer-tag.js --debug [tag-name]
```

### スクリプトの機能

- ✅ Shopifyストアから全ての顧客を自動取得（ページネーション対応）
- ✅ バッチ処理（デフォルト: 50人ずつ）
- ✅ バッチ間の待機時間（デフォルト: 5秒）
- ✅ エラーハンドリングと詳細ログ
- ✅ 進捗表示と最終結果サマリー
- ✅ デバッグモードでの顧客詳細表示

### デバッグモードで表示される情報

- 👤 顧客ID
- 📧 メールアドレス
- 👤 名前（姓名）
- 🏷️ 顧客の状態（enabled/disabled等）
- 📱 電話番号
- 📅 作成日・更新日
- 🏷️ 既存タグ
- 💰 総支払額
- 📦 注文数
- 🔧 メタフィールド（namespace.key: value (type)）

### 設定のカスタマイズ

`scripts/batch-customer-tag.js`の以下の定数を変更して調整できます：

```javascript
const BATCH_SIZE = 50;           // 一度に処理する顧客数
const DELAY_BETWEEN_BATCHES = 5000; // バッチ間の待機時間（ミリ秒）
```

### 例：実行結果

```
🚀 Starting batch customer tag processing with tag: "promotion-2024"
📡 API Base URL: https://shopify-trigger-tu1a.vercel.app
🏪 Shopify Store: your-shop.myshopify.com
📦 Batch Size: 50
⏱️ Delay Between Batches: 5000ms
🐛 Debug Mode: OFF

📋 Fetching active customers from Shopify...
   📄 Fetching page 1...
   ✅ Found 127 customers on page 1

✅ Total customers found: 127

📊 Processing 127 customers in 3 batches...

🔄 Processing batch 1 (50 customers)...
   ✅ Successful: 50
   ❌ Failed: 0

📈 FINAL RESULTS:
✅ Total Successful: 127
❌ Total Failed: 0
📊 Success Rate: 100.0%
```

## API詳細仕様

### POST /api/customer-tag

顧客にタグを付与して2秒後に削除するAPIエンドポイント。

**パラメータ:**
- `customerId` (必須): Shopify顧客ID（数値）
- `tag` (オプション): 付与するタグ名（デフォルト: "temp-tag"）

**レスポンス例:**

**成功時（200）:**
```json
{
  "success": true,
  "message": "Tag \"promotion\" was added and removed for customer 123456789",
  "customerId": 123456789,
  "tag": "promotion"
}
```

**エラー例:**

**顧客IDが未指定（400）:**
```json
{
  "error": "Customer ID is required"
}
```

**顧客が見つからない（404）:**
```json
{
  "error": "Customer not found"
}
```

**認証エラー（401）:**
```json
{
  "error": "Invalid Shopify credentials"
}
```

**設定エラー（500）:**
```json
{
  "error": "Shopify credentials not configured"
}
```

### APIの動作フロー

1. 顧客情報を取得
2. 指定したタグを既存タグに追加してShopifyに送信
3. **2秒待機**
4. タグを削除（元の状態に戻す）してShopifyに送信
5. **2秒待機**
6. 成功レスポンスを返却

## Vercelデプロイ

1. Vercelアカウントでプロジェクトをインポート
2. 環境変数 `SHOPIFY_SHOP_DOMAIN` と `SHOPIFY_ACCESS_TOKEN` を設定
3. デプロイ完了

## 必要なShopify権限

- `read_customers`
- `write_customers`

## 注意事項

- バッチ処理実行中はShopify API制限を考慮して適切な間隔で処理します
- 大量の顧客がいる場合は処理時間が長くなる可能性があります
- デバッグモードは処理が遅くなるため、本番実行では無効にしてください