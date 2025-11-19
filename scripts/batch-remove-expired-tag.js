const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

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
  timeout: 30000, // 30秒タイムアウト
});

const localApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60秒タイムアウト（API処理が長い可能性があるため）
});

// リトライ機能付きAPIリクエスト
async function fetchWithRetry(apiCall, maxRetries = 3, retryDelay = 2000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;

      // リトライ可能なエラーかチェック
      const isRetryable =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENETUNREACH' ||
        (error.response && error.response.status >= 500) ||
        (!error.response && error.request); // リクエストは送信されたがレスポンスなし

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      console.warn(`   ⚠️  Request failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
      console.warn(`   🔄 Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError;
}

async function fetchAllCustomersWithFWJTag() {
  console.log('📋 Fetching customers with "FWJカード会員" tag from Shopify...');

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

      const response = await fetchWithRetry(() => shopifyApi.get('/customers.json', { params }));
      const customers = response.data.customers;

      // デバッグ: 取得した全顧客の情報を表示
      if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
        console.log(`\n   🔍 DEBUG: Total customers fetched on page ${pageCount}: ${customers.length}`);
        customers.forEach((customer, index) => {
          console.log(`   ${index + 1}. Customer ${customer.id} (${customer.email})`);
          console.log(`      State: ${customer.state}`);
          console.log(`      Tags: "${customer.tags}"`);
          const tags = customer.tags ? customer.tags.split(', ') : [];
          console.log(`      Tags Array: [${tags.map(t => `"${t}"`).join(', ')}]`);
          console.log(`      Has FWJカード会員: ${tags.includes('FWJカード会員')}`);
        });
      }

      // "FWJカード会員" タグを持つ顧客のみフィルタリング
      const fwjCustomers = customers.filter(customer => {
        const tags = customer.tags ? customer.tags.split(', ') : [];
        return tags.includes('FWJカード会員');
      });

      allCustomers = allCustomers.concat(fwjCustomers);

      console.log(`   ✅ Found ${fwjCustomers.length} customers with "FWJカード会員" tag on page ${pageCount} (out of ${customers.length} total)`);

      const linkHeader = response.headers.link;
      nextPageInfo = extractNextPageInfo(linkHeader);

      await new Promise(resolve => setTimeout(resolve, 500));

    } while (nextPageInfo);

    console.log(`\n✅ Total customers with "FWJカード会員" tag: ${allCustomers.length}`);
    return allCustomers;

  } catch (error) {
    console.error('❌ Error fetching customers:');
    console.error('   Error Type:', error.constructor.name);
    console.error('   Error Message:', error.message);
    if (error.code) console.error('   Error Code:', error.code);
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
      console.error('   Response Headers:', JSON.stringify(error.response.headers, null, 2));
    }
    if (error.request && !error.response) {
      console.error('   No response received from server');
      console.error('   Request details:', {
        method: error.config?.method,
        url: error.config?.url,
        timeout: error.config?.timeout,
      });
    }
    console.error('   Stack:', error.stack);
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
    const response = await fetchWithRetry(() => shopifyApi.get(`/customers/${customerId}/metafields.json`));
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
      console.log(`      ${metafield.namespace}.${metafield.key}: ${metafield.value} (${metafield.type || metafield.value_type})`);
    });

    // 特に fwj_effectivedate を強調表示
    const fwjMetafield = metafields.find(m => m.namespace === 'custom' && m.key === 'fwj_effectivedate');
    if (fwjMetafield) {
      const effectiveDate = new Date(fwjMetafield.value);
      const currentDate = new Date();
      const isExpired = effectiveDate < currentDate;
      console.log(`   📅 FWJ Effective Date: ${fwjMetafield.value} ${isExpired ? '🔴 EXPIRED' : '🟢 VALID'}`);
    }
  } else {
    console.log(`   🔧 Metafields: None`);
  }
}

async function callRemoveExpiredTagApi(customerId) {
  try {
    const response = await localApi.post('/api/remove-expired-tag', {
      customerId
    });

    return {
      success: response.data.success || response.data.tagRemoved,
      customerId,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      customerId,
      error: error.response?.data?.error || error.message,
      data: error.response?.data
    };
  }
}

async function processBatch(customers, batchIndex, debug = false) {
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
    callRemoveExpiredTagApi(customer.id)
  );

  const results = await Promise.all(promises);

  const tagRemoved = results.filter(r => r.success && r.data?.tagRemoved === true);
  const notExpired = results.filter(r => !r.success && r.data?.message?.includes('has not passed yet'));
  const tagNotFound = results.filter(r => !r.success && r.data?.message?.includes('not found on customer'));
  const metafieldNotFound = results.filter(r => !r.success && r.data?.error?.includes('Metafield'));
  const failed = results.filter(r =>
    !r.success &&
    !r.data?.message?.includes('has not passed yet') &&
    !r.data?.message?.includes('not found on customer') &&
    !r.data?.error?.includes('Metafield')
  );

  console.log(`   ✅ Tag Removed (Expired): ${tagRemoved.length}`);
  console.log(`   🟢 Not Expired Yet: ${notExpired.length}`);
  console.log(`   🟡 Tag Not Found: ${tagNotFound.length}`);
  console.log(`   🟠 Metafield Not Found: ${metafieldNotFound.length}`);
  if (failed.length > 0) {
    console.log(`   ❌ Failed: ${failed.length}`);
    failed.forEach(failure => {
      console.log(`      Customer ${failure.customerId}: ${failure.error}`);
    });
  }

  return { tagRemoved, notExpired, tagNotFound, metafieldNotFound, failed };
}

async function main() {
  const debugMode = process.argv.includes('--debug') || process.argv.includes('-d');
  const verboseMode = process.argv.includes('--verbose') || process.argv.includes('-v');

  console.log(`🚀 Starting batch expired tag removal processing`);
  console.log(`📡 API Base URL: ${API_BASE_URL}`);
  console.log(`🏪 Shopify Store: ${SHOPIFY_SHOP_DOMAIN}`);
  console.log(`📦 Batch Size: ${BATCH_SIZE}`);
  console.log(`⏱️  Delay Between Batches: ${DELAY_BETWEEN_BATCHES}ms`);
  console.log(`🐛 Debug Mode: ${debugMode ? 'ON' : 'OFF'}`);
  console.log(`🔍 Verbose Mode: ${verboseMode ? 'ON' : 'OFF'}\n`);

  try {
    const customers = await fetchAllCustomersWithFWJTag();

    if (customers.length === 0) {
      console.log('ℹ️  No customers with "FWJカード会員" tag found.');
      return;
    }

    const batches = [];
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      batches.push(customers.slice(i, i + BATCH_SIZE));
    }

    console.log(`\n📊 Processing ${customers.length} customers in ${batches.length} batches...\n`);

    let totalTagRemoved = 0;
    let totalNotExpired = 0;
    let totalTagNotFound = 0;
    let totalMetafieldNotFound = 0;
    let totalFailed = 0;
    const allFailures = [];
    const removedCustomers = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const results = await processBatch(batch, i, debugMode);

      totalTagRemoved += results.tagRemoved.length;
      totalNotExpired += results.notExpired.length;
      totalTagNotFound += results.tagNotFound.length;
      totalMetafieldNotFound += results.metafieldNotFound.length;
      totalFailed += results.failed.length;
      allFailures.push(...results.failed);
      removedCustomers.push(...results.tagRemoved);

      if (i < batches.length - 1) {
        console.log(`   ⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    console.log(`\n📈 FINAL RESULTS:`);
    console.log(`✅ Tags Removed (Expired): ${totalTagRemoved}`);
    console.log(`🟢 Not Expired Yet: ${totalNotExpired}`);
    console.log(`🟡 Tag Not Found: ${totalTagNotFound}`);
    console.log(`🟠 Metafield Not Found: ${totalMetafieldNotFound}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`📊 Total Processed: ${customers.length}`);

    if (removedCustomers.length > 0) {
      console.log(`\n✅ CUSTOMERS WITH TAG REMOVED:`);
      removedCustomers.forEach(result => {
        console.log(`   Customer ${result.customerId}: Expired on ${result.data.effectiveDate}`);
      });
    }

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
