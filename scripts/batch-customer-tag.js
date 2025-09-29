const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_BASE_URL = 'https://shopify-trigger-tu1a.vercel.app';

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES = 5000;

if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ Error: SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set in .env.local');
  process.exit(1);
}

const shopifyApi = axios.create({
  baseURL: `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-07`,
  headers: {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

const localApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

async function fetchAllActiveCustomers() {
  console.log('📋 Fetching active customers from Shopify...');

  let allCustomers = [];
  let nextPageInfo = null;
  let pageCount = 0;

  try {
    do {
      pageCount++;
      console.log(`   📄 Fetching page ${pageCount}...`);

      const params = {
        limit: 250,
        state: 'enabled',
        fields: 'id,email,first_name,last_name,state,phone,created_at,updated_at,tags,total_spent,orders_count'
      };

      if (nextPageInfo) {
        params.page_info = nextPageInfo;
      }

      const response = await shopifyApi.get('/customers.json', { params });
      const customers = response.data.customers;

      const activeCustomers = customers.filter(customer =>
        customer.state === 'enabled'
      );

      allCustomers = allCustomers.concat(activeCustomers);

      console.log(`   ✅ Found ${activeCustomers.length} active customers on page ${pageCount}`);

      const linkHeader = response.headers.link;
      nextPageInfo = extractNextPageInfo(linkHeader);

      await new Promise(resolve => setTimeout(resolve, 500));

    } while (nextPageInfo);

    console.log(`\n✅ Total active customers found: ${allCustomers.length}`);
    return allCustomers;

  } catch (error) {
    console.error('❌ Error fetching customers:', error.response?.data || error.message);
    throw error;
  }
}

function extractNextPageInfo(linkHeader) {
  if (!linkHeader) return null;

  const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return nextMatch ? nextMatch[1] : null;
}

async function fetchCustomerMetafields(customerId) {
  try {
    const response = await shopifyApi.get(`/customers/${customerId}/metafields.json`);
    return response.data.metafields;
  } catch (error) {
    console.warn(`   ⚠️  Failed to fetch metafields for customer ${customerId}:`, error.response?.data?.error || error.message);
    return [];
  }
}

function displayCustomerInfo(customer, metafields = []) {
  console.log(`\n👤 Customer: ${customer.id}`);
  console.log(`   📧 Email: ${customer.email || 'N/A'}`);
  console.log(`   👤 Name: ${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'N/A');
  console.log(`   📱 Phone: ${customer.phone || 'N/A'}`);
  console.log(`   📅 Created: ${customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}`);
  console.log(`   📅 Updated: ${customer.updated_at ? new Date(customer.updated_at).toLocaleDateString() : 'N/A'}`);
  console.log(`   🏷️  Tags: ${customer.tags || 'None'}`);
  console.log(`   💰 Total Spent: ${customer.total_spent || '0'}`);
  console.log(`   📦 Orders Count: ${customer.orders_count || '0'}`);

  if (metafields && metafields.length > 0) {
    console.log(`   🔧 Metafields:`);
    metafields.forEach(metafield => {
      console.log(`      ${metafield.namespace}.${metafield.key}: ${metafield.value} (${metafield.value_type})`);
    });
  } else {
    console.log(`   🔧 Metafields: None`);
  }
}

async function callCustomerTagApi(customerId, tag = 'batch-processed') {
  try {
    const response = await localApi.post('/api/customer-tag', {
      customerId,
      tag
    });

    return {
      success: true,
      customerId,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      customerId,
      error: error.response?.data?.error || error.message
    };
  }
}

async function processBatch(customers, batchIndex, tag, debug = false) {
  console.log(`\n🔄 Processing batch ${batchIndex + 1} (${customers.length} customers)...`);

  if (debug) {
    console.log(`\n📋 Customer Details for Batch ${batchIndex + 1}:`);
    for (const customer of customers) {
      const metafields = await fetchCustomerMetafields(customer.id);
      displayCustomerInfo(customer, metafields);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.log(`\n🔄 Proceeding with API calls...`);
  }

  const promises = customers.map(customer =>
    callCustomerTagApi(customer.id, tag)
  );

  const results = await Promise.all(promises);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`   ✅ Successful: ${successful.length}`);
  if (failed.length > 0) {
    console.log(`   ❌ Failed: ${failed.length}`);
    failed.forEach(failure => {
      console.log(`      Customer ${failure.customerId}: ${failure.error}`);
    });
  }

  return { successful, failed };
}

async function main() {
  const tag = process.argv[2] || 'batch-processed';
  const debugMode = process.argv.includes('--debug') || process.argv.includes('-d');

  console.log(`🚀 Starting batch customer tag processing with tag: "${tag}"`);
  console.log(`📡 API Base URL: ${API_BASE_URL}`);
  console.log(`🏪 Shopify Store: ${SHOPIFY_SHOP_DOMAIN}`);
  console.log(`📦 Batch Size: ${BATCH_SIZE}`);
  console.log(`⏱️  Delay Between Batches: ${DELAY_BETWEEN_BATCHES}ms`);
  console.log(`🐛 Debug Mode: ${debugMode ? 'ON' : 'OFF'}\n`);

  try {
    const customers = await fetchAllActiveCustomers();

    if (customers.length === 0) {
      console.log('ℹ️  No active customers found.');
      return;
    }

    const batches = [];
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      batches.push(customers.slice(i, i + BATCH_SIZE));
    }

    console.log(`\n📊 Processing ${customers.length} customers in ${batches.length} batches...\n`);

    let totalSuccessful = 0;
    let totalFailed = 0;
    const allFailures = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const results = await processBatch(batch, i, tag, debugMode);

      totalSuccessful += results.successful.length;
      totalFailed += results.failed.length;
      allFailures.push(...results.failed);

      if (i < batches.length - 1) {
        console.log(`   ⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    console.log(`\n📈 FINAL RESULTS:`);
    console.log(`✅ Total Successful: ${totalSuccessful}`);
    console.log(`❌ Total Failed: ${totalFailed}`);
    console.log(`📊 Success Rate: ${((totalSuccessful / customers.length) * 100).toFixed(1)}%`);

    if (allFailures.length > 0) {
      console.log(`\n❌ FAILED CUSTOMERS:`);
      allFailures.forEach(failure => {
        console.log(`   Customer ${failure.customerId}: ${failure.error}`);
      });
    }

  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}