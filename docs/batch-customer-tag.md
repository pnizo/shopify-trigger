# batch-customer-tag.js マニュアル

## 概要

Shopifyの全てのアクティブな顧客に対して、バッチ処理でタグを付与するスクリプトです。顧客情報を取得し、指定されたタグを一括で追加することができます。

## 主な機能

- Shopifyストアの全アクティブ顧客を自動取得
- ページネーション対応（最大250件ずつ取得）
- バッチ処理による効率的なタグ付け
- リトライ機能付きAPIリクエスト（最大3回）
- デバッグモードでの詳細情報表示
- エラーハンドリングと処理結果の集計

## 前提条件

### 必要な環境変数

`.env.local`ファイルに以下の環境変数を設定する必要があります:

```env
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxx
API_BASE_URL=http://localhost:3000  # オプション（デフォルト: http://localhost:3000）
```

### 必要なパッケージ

```json
{
  "axios": "^1.x.x",
  "dotenv": "^16.x.x"
}
```

## 使用方法

### 基本的な使用方法

```bash
# デフォルトタグ "batch-processed" を付与
node scripts/batch-customer-tag.js

# カスタムタグを指定
node scripts/batch-customer-tag.js "VIP会員"
```

### デバッグモード

デバッグモードを有効にすると、各顧客の詳細情報（メタフィールドを含む）がバッチ処理前に表示されます。

```bash
# デバッグモード（--debug または -d）
node scripts/batch-customer-tag.js "VIP会員" --debug
node scripts/batch-customer-tag.js "VIP会員" -d
```

### コマンドライン引数

| 引数 | 説明 | デフォルト値 |
|------|------|-------------|
| 第1引数 | 付与するタグ名 | `"batch-processed"` |
| `--debug` または `-d` | デバッグモード有効化 | 無効 |

## 設定パラメータ

スクリプト内で以下のパラメータを調整できます:

```javascript
const BATCH_SIZE = 10;              // バッチあたりの顧客数
const DELAY_BETWEEN_BATCHES = 5000; // バッチ間の待機時間（ミリ秒）
```

### 推奨設定

- **BATCH_SIZE**: 10-50（API制限を考慮）
- **DELAY_BETWEEN_BATCHES**: 3000-5000ms（レート制限回避のため）

## 処理フロー

1. **環境変数の検証**: 必須の環境変数が設定されているか確認
2. **顧客データ取得**: Shopify APIから全アクティブ顧客を取得
3. **バッチ分割**: 取得した顧客をバッチサイズごとに分割
4. **バッチ処理**: 各バッチに対してタグ付けAPIを並列実行
5. **結果集計**: 成功・失敗をカウントし、最終結果を表示

## API エンドポイント

### 使用するShopify API

- `GET /admin/api/2025-10/customers.json`
  - アクティブ顧客の一覧を取得
  - パラメータ:
    - `limit`: 250（最大）
    - `state`: "enabled"
    - `fields`: 顧客情報フィールド

- `GET /admin/api/2025-10/customers/{customerId}/metafields.json`
  - 顧客のメタフィールドを取得（デバッグモード時）

### ローカルAPI

- `POST /api/customer-tag`
  - リクエストボディ:
    ```json
    {
      "customerId": "gid://shopify/Customer/123456789",
      "tag": "タグ名"
    }
    ```

## 出力例

### 通常モード

```
🚀 Starting batch customer tag processing with tag: "VIP会員"
📡 API Base URL: http://localhost:3000
🏪 Shopify Store: your-shop.myshopify.com
📦 Batch Size: 10
⏱️  Delay Between Batches: 5000ms
🐛 Debug Mode: OFF

📋 Fetching active customers from Shopify...
   📄 Fetching page 1...
   ✅ Found 250 active customers on page 1
   📄 Fetching page 2...
   ✅ Found 123 active customers on page 2

✅ Total active customers found: 373

📊 Processing 373 customers in 38 batches...

🔄 Processing batch 1 (10 customers)...
   ✅ Successful: 10
   ⏳ Waiting 5000ms before next batch...

[...]

📈 FINAL RESULTS:
✅ Total Successful: 370
❌ Total Failed: 3
📊 Success Rate: 99.2%
```

### デバッグモード

デバッグモードでは、各顧客の詳細情報が表示されます:

```
📋 Customer Details for Batch 1:

👤 Customer: gid://shopify/Customer/123456789
   📧 Email: customer@example.com
   👤 Name: 田中 太郎
   📱 Phone: 090-1234-5678
   📅 Created: 2024/1/15
   📅 Updated: 2025/3/20
   🏷️  Tags: 既存タグ1, 既存タグ2
   💰 Total Spent: 15000
   📦 Orders Count: 3
   🔧 Metafields:
      custom.fwj_effectivedate: 2025-12-31 (single_line_text_field)
      custom.membership_level: Gold (single_line_text_field)
```

## エラーハンドリング

### リトライ対象のエラー

以下のエラーは自動的にリトライされます（最大3回）:

- `ECONNRESET`: 接続リセット
- `ETIMEDOUT`: タイムアウト
- `ENOTFOUND`: ホストが見つからない
- `ECONNREFUSED`: 接続拒否
- `ENETUNREACH`: ネットワーク到達不可
- HTTPステータス500番台: サーバーエラー
- レスポンスなしエラー

### タイムアウト設定

- Shopify API: 30秒
- ローカルAPI: 60秒

## トラブルシューティング

### 環境変数エラー

```
❌ Error: SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set in .env.local
```

**解決方法**: `.env.local`ファイルに必要な環境変数を設定してください。

### API接続エラー

```
❌ Error fetching customers:
   Error Type: Error
   Error Message: connect ECONNREFUSED 127.0.0.1:3000
```

**解決方法**:
- ローカルAPIサーバーが起動しているか確認
- `API_BASE_URL`が正しく設定されているか確認

### レート制限エラー

Shopify APIのレート制限に達した場合は、以下を調整してください:

- `BATCH_SIZE`を小さくする
- `DELAY_BETWEEN_BATCHES`を大きくする
- ページ取得間の待機時間（現在500ms）を増やす

## 注意事項

1. **大量顧客への実行**: 顧客数が多い場合、処理に時間がかかります
2. **重複タグ**: 既に同じタグが付いている場合の動作はAPIの実装に依存します
3. **バックアップ**: 重要なタグ操作の前にデータのバックアップを推奨します
4. **API制限**: Shopifyのレート制限（毎秒2リクエスト）に注意してください
5. **トークン権限**: アクセストークンに顧客の読み取り・書き込み権限が必要です

## セキュリティ

- アクセストークンは`.env.local`ファイルで管理
- `.env.local`は`.gitignore`に含めること
- トークンは適切な権限スコープで発行すること

## 関連ファイル

- `scripts/batch-remove-expired-tag.js`: 期限切れタグを削除するスクリプト
- `pages/api/customer-tag.js`: タグ付けAPIエンドポイント（想定）

## 更新履歴

- 2025-01: 初版作成
- バッチサイズ調整、リトライ機能追加
