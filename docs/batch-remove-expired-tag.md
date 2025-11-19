# batch-remove-expired-tag.js マニュアル

## 概要

「FWJカード会員」タグを持つ顧客の中から、カード有効期限（`fwj_effectivedate`メタフィールド）が切れた顧客を検出し、タグを自動削除するバッチ処理スクリプトです。

## 主な機能

- 「FWJカード会員」タグを持つ顧客の自動検出
- カード有効期限のチェック（メタフィールド`custom.fwj_effectivedate`）
- 期限切れ顧客からのタグ自動削除
- バッチ処理による効率的な処理
- リトライ機能付きAPIリクエスト（最大3回）
- デバッグモード・詳細モード対応
- 詳細な処理結果の分類と集計

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

### 必要なメタフィールド設定

顧客に以下のメタフィールドが設定されている必要があります:

- **Namespace**: `custom`
- **Key**: `fwj_effectivedate`
- **Type**: `single_line_text_field` または `date`
- **値の形式**: ISO 8601形式（例: `2025-12-31`）

## 使用方法

### 基本的な使用方法

```bash
# 期限切れタグを削除
node scripts/batch-remove-expired-tag.js
```

### デバッグモード

デバッグモードを有効にすると、各顧客の詳細情報（メタフィールド、有効期限の状態など）が表示されます。

```bash
# デバッグモード（--debug または -d）
node scripts/batch-remove-expired-tag.js --debug
node scripts/batch-remove-expired-tag.js -d
```

### 詳細モード（Verbose）

詳細モードでは、顧客取得時の詳細なデバッグ情報が表示されます。

```bash
# 詳細モード（--verbose または -v）
node scripts/batch-remove-expired-tag.js --verbose
node scripts/batch-remove-expired-tag.js -v

# デバッグ＋詳細モード
node scripts/batch-remove-expired-tag.js --debug --verbose
```

### コマンドライン引数

| 引数 | 説明 | デフォルト値 |
|------|------|-------------|
| `--debug` または `-d` | デバッグモード有効化（顧客詳細表示） | 無効 |
| `--verbose` または `-v` | 詳細モード有効化（取得処理の詳細表示） | 無効 |

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
2. **対象顧客の取得**: 「FWJカード会員」タグを持つ全顧客を取得
3. **バッチ分割**: 取得した顧客をバッチサイズごとに分割
4. **バッチ処理**: 各顧客の有効期限をチェックし、期限切れの場合タグを削除
5. **結果集計**: 処理結果を分類（削除済み/未期限/タグなし/メタフィールドなし/失敗）
6. **レポート出力**: 最終結果と削除された顧客のリストを表示

## API エンドポイント

### 使用するShopify API

- `GET /admin/api/2025-07/customers.json`
  - 顧客一覧を取得し、「FWJカード会員」タグでフィルタリング
  - パラメータ:
    - `limit`: 250（最大）
    - `state`: "enabled"
    - `fields`: 顧客情報フィールド

- `GET /admin/api/2025-07/customers/{customerId}/metafields.json`
  - 顧客のメタフィールドを取得（デバッグモード時）

### ローカルAPI

- `POST /api/remove-expired-tag`
  - リクエストボディ:
    ```json
    {
      "customerId": "gid://shopify/Customer/123456789"
    }
    ```
  - レスポンス例（成功時）:
    ```json
    {
      "success": true,
      "tagRemoved": true,
      "effectiveDate": "2024-12-31",
      "message": "Tag removed successfully"
    }
    ```
  - レスポンス例（未期限）:
    ```json
    {
      "success": false,
      "tagRemoved": false,
      "message": "Effective date 2026-12-31 has not passed yet"
    }
    ```

## 処理結果の分類

スクリプトは処理結果を以下の5つのカテゴリに分類します:

### 1. Tag Removed (Expired) - タグ削除済み

有効期限が切れており、タグが正常に削除された顧客

### 2. Not Expired Yet - 未期限

有効期限がまだ切れていない顧客（タグは維持される）

### 3. Tag Not Found - タグなし

「FWJカード会員」タグが顧客に見つからなかった場合
※通常は発生しないはずですが、処理中にタグが削除された可能性があります

### 4. Metafield Not Found - メタフィールドなし

`custom.fwj_effectivedate`メタフィールドが設定されていない顧客

### 5. Failed - 失敗

その他のエラー（API接続エラーなど）

## 出力例

### 通常モード

```
🚀 Starting batch expired tag removal processing
📡 API Base URL: http://localhost:3000
🏪 Shopify Store: your-shop.myshopify.com
📦 Batch Size: 10
⏱️  Delay Between Batches: 5000ms
🐛 Debug Mode: OFF
🔍 Verbose Mode: OFF

📋 Fetching customers with "FWJカード会員" tag from Shopify...
   📄 Fetching page 1...
   ✅ Found 45 customers with "FWJカード会員" tag on page 1 (out of 250 total)
   📄 Fetching page 2...
   ✅ Found 12 customers with "FWJカード会員" tag on page 2 (out of 123 total)

✅ Total customers with "FWJカード会員" tag: 57

📊 Processing 57 customers in 6 batches...

🔄 Processing batch 1 (10 customers)...
   ✅ Tag Removed (Expired): 3
   🟢 Not Expired Yet: 6
   🟡 Tag Not Found: 0
   🟠 Metafield Not Found: 1
   ⏳ Waiting 5000ms before next batch...

[...]

📈 FINAL RESULTS:
✅ Tags Removed (Expired): 15
🟢 Not Expired Yet: 38
🟡 Tag Not Found: 0
🟠 Metafield Not Found: 4
❌ Failed: 0
📊 Total Processed: 57

✅ CUSTOMERS WITH TAG REMOVED:
   Customer gid://shopify/Customer/123456789: Expired on 2024-12-31
   Customer gid://shopify/Customer/987654321: Expired on 2025-01-15
   [...]
```

### デバッグモード

デバッグモードでは、各顧客の詳細情報と有効期限の状態が表示されます:

```
📋 Customer Details for Batch 1:

👤 Customer: gid://shopify/Customer/123456789
   📧 Email: customer@example.com
   👤 Name: 山田 花子
   📱 Phone: 080-9876-5432
   📅 Created: 2024/6/10
   📅 Updated: 2025/3/20
   🏷️  Tags: FWJカード会員, VIP会員
   💰 Total Spent: 45000
   📦 Orders Count: 8
   🔧 Metafields:
      custom.fwj_effectivedate: 2024-12-31 (single_line_text_field)
      custom.membership_level: Gold (single_line_text_field)
   📅 FWJ Effective Date: 2024-12-31 🔴 EXPIRED

👤 Customer: gid://shopify/Customer/987654321
   📧 Email: customer2@example.com
   👤 Name: 佐藤 一郎
   [...]
   📅 FWJ Effective Date: 2026-12-31 🟢 VALID

🔄 Proceeding with API calls...
```

### 詳細モード（Verbose）

詳細モードでは、顧客取得時の詳細なフィルタリング情報が表示されます:

```
📋 Fetching customers with "FWJカード会員" tag from Shopify...
   📄 Fetching page 1...

   🔍 DEBUG: Total customers fetched on page 1: 250
   1. Customer gid://shopify/Customer/111111111 (test1@example.com)
      State: enabled
      Tags: "通常会員, メルマガ購読"
      Tags Array: ["通常会員", "メルマガ購読"]
      Has FWJカード会員: false
   2. Customer gid://shopify/Customer/222222222 (test2@example.com)
      State: enabled
      Tags: "FWJカード会員, VIP会員"
      Tags Array: ["FWJカード会員", "VIP会員"]
      Has FWJカード会員: true
   [...]
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
- ローカルAPI: 60秒（期限チェック処理が含まれるため長めに設定）

## トラブルシューティング

### 対象顧客が見つからない

```
ℹ️  No customers with "FWJカード会員" tag found.
```

**原因**:
- 該当するタグを持つ顧客が存在しない
- タグ名の表記が異なる（全角/半角スペースなど）

**解決方法**:
- Shopify管理画面で顧客のタグを確認
- スクリプト内のタグ名（68行目）が正しいか確認

### メタフィールドが見つからない

```
🟠 Metafield Not Found: 10
```

**原因**:
- `custom.fwj_effectivedate`メタフィールドが設定されていない顧客が存在

**解決方法**:
- メタフィールドの設定を確認
- 該当顧客に有効期限を設定

### API接続エラー

```
❌ Error fetching customers:
   No response received from server
```

**解決方法**:
- ローカルAPIサーバーが起動しているか確認
- `API_BASE_URL`が正しく設定されているか確認
- ファイアウォール設定を確認

## 運用上の注意事項

### 1. 定期実行の推奨

期限切れタグを定期的に削除するため、cronやタスクスケジューラーでの定期実行を推奨します。

**例（毎日午前3時に実行）**:
```cron
0 3 * * * cd /path/to/project && node scripts/batch-remove-expired-tag.js >> /var/log/batch-remove.log 2>&1
```

### 2. 実行タイミング

- 顧客アクティビティが少ない時間帯（深夜など）に実行することを推奨
- 他のバッチ処理と時間をずらして実行

### 3. ログの保存

処理結果をログファイルに保存することを推奨します:

```bash
node scripts/batch-remove-expired-tag.js > logs/batch-remove-$(date +\%Y\%m\%d).log 2>&1
```

### 4. バックアップ

- 重要なタグ操作の前にデータのバックアップを推奨
- 誤削除に備えて、削除されたタグの記録を保持

### 5. モニタリング

以下の項目を定期的に確認してください:

- 削除されたタグの数が異常に多くないか
- メタフィールドが設定されていない顧客の数
- API接続エラーの発生頻度

## セキュリティ

- アクセストークンは`.env.local`ファイルで管理
- `.env.local`は`.gitignore`に含めること
- トークンは適切な権限スコープで発行すること
- 顧客データの取り扱いに注意（個人情報保護）

## パフォーマンス最適化

### 大量顧客への対応

顧客数が数千人を超える場合:

1. `BATCH_SIZE`を20-50に増やす
2. 並列処理数を調整（`Promise.all`を`Promise.allSettled`に変更も検討）
3. メモリ使用量をモニタリング

### API制限の回避

- Shopifyのレート制限（毎秒2リクエスト）を考慮
- `DELAY_BETWEEN_BATCHES`を適切に設定
- ページ取得間の待機時間（現在500ms）を調整

## 関連ファイル

- `scripts/batch-customer-tag.js`: 顧客にタグを一括付与するスクリプト
- `pages/api/remove-expired-tag.js`: タグ削除APIエンドポイント（想定）

## 更新履歴

- 2025-03: FWJカード有効期限チェック機能追加
- 2025-01: 初版作成
- バッチサイズ調整、詳細モード追加

## FAQ

### Q: タグ削除は元に戻せますか？

A: API経由での削除は即座に反映されます。元に戻すには再度タグを付与する必要があります。重要な処理の前にバックアップを推奨します。

### Q: デバッグモードで実行すると処理が遅くなりますか？

A: はい。デバッグモードでは各顧客のメタフィールドを取得するため、通常モードより時間がかかります。本番運用では通常モードでの実行を推奨します。

### Q: 有効期限の判定基準は？

A: `fwj_effectivedate`の日付と実行時の現在日時を比較し、有効期限が過去の場合に期限切れと判定されます。日付の判定はAPIエンドポイント側で行われます。

### Q: 複数のタグを持つ顧客の場合、他のタグも削除されますか？

A: いいえ。「FWJカード会員」タグのみが削除対象です。他のタグは維持されます。
