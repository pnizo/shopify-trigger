import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

interface ShopifyCustomer {
  id: number;
  tags: string;
}

interface ShopifyCustomerResponse {
  customer: ShopifyCustomer;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customerId, tag = 'temp-tag' } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    return res.status(500).json({ error: 'Shopify credentials not configured' });
  }

  const apiUrl = `https://${shopDomain}/admin/api/2023-10/customers/${customerId}.json`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  try {
    const getResponse = await axios.get<ShopifyCustomerResponse>(apiUrl, { headers });
    const customer = getResponse.data.customer;

    const existingTags = customer.tags ? customer.tags.split(', ') : [];
    const newTags = [...existingTags, tag];

    const updatePayload = {
      customer: {
        id: customer.id,
        tags: newTags.join(', ')
      }
    };

    await axios.put(apiUrl, updatePayload, { headers });

    const finalTags = existingTags.join(', ');
    const removePayload = {
      customer: {
        id: customer.id,
        tags: finalTags
      }
    };

    await axios.put(apiUrl, removePayload, { headers });

    return res.status(200).json({
      success: true,
      message: `Tag "${tag}" was added and removed for customer ${customerId}`,
      customerId,
      tag
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
      error: 'Failed to process customer tag operation',
      details: error.response?.data || error.message
    });
  }
}