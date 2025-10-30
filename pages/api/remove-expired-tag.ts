import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

interface ShopifyCustomer {
  id: number;
  tags: string;
}

interface ShopifyCustomerResponse {
  customer: ShopifyCustomer;
}

interface ShopifyMetafield {
  id: number;
  namespace: string;
  key: string;
  value: string;
  type: string;
}

interface ShopifyMetafieldsResponse {
  metafields: ShopifyMetafield[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customerId } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    return res.status(500).json({ error: 'Shopify credentials not configured' });
  }

  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  try {
    // 1. 顧客のメタフィールドを取得
    const metafieldsUrl = `https://${shopDomain}/admin/api/2025-07/customers/${customerId}/metafields.json`;
    const metafieldsResponse = await axios.get<ShopifyMetafieldsResponse>(metafieldsUrl, { headers });
    const metafields = metafieldsResponse.data.metafields;

    // 2秒待機（Shopify API制限対策）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. custom.fwj_effectivedate メタフィールドを検索
    const fwjEffectiveDateMetafield = metafields.find(
      (metafield) => metafield.namespace === 'custom' && metafield.key === 'fwj_effectivedate'
    );

    if (!fwjEffectiveDateMetafield) {
      return res.status(404).json({
        error: 'Metafield custom.fwj_effectivedate not found',
        customerId
      });
    }

    // 3. 有効期限を解析
    const effectiveDate = new Date(fwjEffectiveDateMetafield.value);
    const currentDate = new Date();

    // 日付部分のみで比較（時刻を無視）
    effectiveDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);

    // 4. 期限切れかチェック
    if (effectiveDate >= currentDate) {
      return res.status(200).json({
        success: false,
        message: 'Tag not removed - effective date has not passed yet',
        customerId,
        effectiveDate: fwjEffectiveDateMetafield.value,
        currentDate: currentDate.toISOString().split('T')[0],
        tagRemoved: false
      });
    }

    // 5. 顧客情報を取得
    const customerUrl = `https://${shopDomain}/admin/api/2025-07/customers/${customerId}.json`;
    const customerResponse = await axios.get<ShopifyCustomerResponse>(customerUrl, { headers });
    const customer = customerResponse.data.customer;

    // 2秒待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 6. タグから "FWJカード会員" を削除
    const existingTags = customer.tags ? customer.tags.split(', ') : [];
    const tagToRemove = 'FWJカード会員';

    if (!existingTags.includes(tagToRemove)) {
      return res.status(200).json({
        success: false,
        message: `Tag "${tagToRemove}" not found on customer`,
        customerId,
        effectiveDate: fwjEffectiveDateMetafield.value,
        currentTags: existingTags,
        tagRemoved: false
      });
    }

    const newTags = existingTags.filter(tag => tag !== tagToRemove);

    // 7. 顧客のタグを更新
    const updatePayload = {
      customer: {
        id: customer.id,
        tags: newTags.join(', ')
      }
    };

    await axios.put(customerUrl, updatePayload, { headers });

    // 2秒待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    return res.status(200).json({
      success: true,
      message: `Tag "${tagToRemove}" was removed for customer ${customerId}`,
      customerId,
      effectiveDate: fwjEffectiveDateMetafield.value,
      currentDate: currentDate.toISOString().split('T')[0],
      removedTag: tagToRemove,
      previousTags: existingTags,
      currentTags: newTags,
      tagRemoved: true
    });

  } catch (error: any) {
    console.error('Shopify API error:', error.response?.data || error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid Shopify credentials' });
    }

    return res.status(500).json({
      error: 'Failed to process expired tag removal',
      details: error.response?.data || error.message
    });
  }
}
