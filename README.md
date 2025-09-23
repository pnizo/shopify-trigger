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

## 必要なShopify権限

- `read_customers`
- `write_customers`