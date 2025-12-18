const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

console.log('=== Shopify GraphQL Admin API Test ===');
console.log('Shop Domain:', SHOPIFY_SHOP_DOMAIN ? SHOPIFY_SHOP_DOMAIN : '❌ Not set');
console.log('Access Token:', SHOPIFY_ACCESS_TOKEN ? '✅ Set (' + SHOPIFY_ACCESS_TOKEN.substring(0, 8) + '...)' : '❌ Not set');

if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.log('\n❌ Cannot test API - credentials not configured');
  process.exit(1);
}

async function testGraphQLAdminAPI() {
  console.log('\n🔄 Testing GraphQL Admin API connection...');

  const query = `
    {
      shop {
        name
        email
        primaryDomain {
          url
        }
        plan {
          displayName
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-10/graphql.json`,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (response.data.errors) {
      console.log('❌ GraphQL Error:');
      console.log('  Message:', JSON.stringify(response.data.errors, null, 2));
      return;
    }

    console.log('✅ GraphQL Admin API Connection Successful!');
    console.log('\n📊 Shop Info:');
    console.log('  Name:', response.data.data.shop.name);
    console.log('  Email:', response.data.data.shop.email);
    console.log('  Domain:', response.data.data.shop.primaryDomain.url);
    console.log('  Plan:', response.data.data.shop.plan.displayName);
  } catch (error) {
    console.log('❌ GraphQL Admin API Connection Failed!');
    if (error.response) {
      console.log('  Status:', error.response.status);
      console.log('  Message:', JSON.stringify(error.response.data?.errors || error.response.statusText));
    } else {
      console.log('  Error:', error.message);
    }
  }
}

testGraphQLAdminAPI();
