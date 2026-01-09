const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const BATCH_SIZE = 2; // Shopifyのレート制限: 2 calls/second に対応
const DELAY_BETWEEN_BATCHES = 1000;
const DELAY_BETWEEN_REQUESTS = 600; // リクエスト間の遅延（ミリ秒）

if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ Error: SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set in .env.local');
  process.exit(1);
}

const shopifyApi = axios.create({
  baseURL: `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-10`,
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
  timeout: 60000, // 60秒タイムアウト
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
        (!error.response && error.request);

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

async function fetchAllActiveCustomers() {
  console.log('📋 Fetching active customers from Shopify...');

  let allCustomers = [];
  let nextPageInfo = null;
  let pageCount = 0;

  try {
    do {
      pageCount++;
      console.log(`   📄 Fetching page ${pageCount}...`);

      let params;

      if (nextPageInfo) {
        // page_info使用時は他のパラメータを渡せない
        params = {
          limit: 250,
          page_info: nextPageInfo
        };
      } else {
        // 最初のリクエストのみフィルタパラメータを使用
        params = {
          limit: 250,
          state: 'enabled',
          fields: 'id,email,first_name,last_name,state,phone,created_at,updated_at,tags,total_spent,orders_count'
        };
      }

      const response = await fetchWithRetry(() => shopifyApi.get('/customers.json', { params }));
      const customers = response.data.customers;

      // 'FWJカード会員' タグを持つ有効な顧客のみをフィルタリング
      const activeCustomers = customers.filter(customer => {
        if (customer.state !== 'enabled') return false;
        const tags = customer.tags ? customer.tags.split(', ') : [];
        return tags.includes('FWJカード会員');
      });

      allCustomers = allCustomers.concat(activeCustomers);

      console.log(`   ✅ Found ${activeCustomers.length} customers with 'FWJカード会員' tag on page ${pageCount}`);

      const linkHeader = response.headers.link;
      nextPageInfo = extractNextPageInfo(linkHeader);

      await new Promise(resolve => setTimeout(resolve, 500));

    } while (nextPageInfo);

    console.log(`\n✅ Total customers with 'FWJカード会員' tag found: ${allCustomers.length}`);
    return allCustomers;

  } catch (error) {
    console.error('❌ Error fetching customers:');
    console.error('   Error Type:', error.constructor.name);
    console.error('   Error Message:', error.message);
    if (error.code) console.error('   Error Code:', error.code);
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.request && !error.response) {
      console.error('   No response received from server');
      console.error('   Request details:', {
        method: error.config?.method,
        url: error.config?.url,
        timeout: error.config?.timeout,
      });
    }
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
      console.log(`      ${metafield.namespace}.${metafield.key}: ${metafield.value} (${metafield.value_type})`);
    });
  } else {
    console.log(`   🔧 Metafields: None`);
  }
}

async function callCustomerTagApi(customerId, tag = 'batch-processed', retryCount = 0, maxRetries = 3) {
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
    const isRateLimitError = 
      error.response?.status === 429 || 
      error.response?.status === 500 && error.response?.data?.error?.toLowerCase?.().includes('exceeded');
    
    // レート制限エラーの場合、リトライ
    if (isRateLimitError && retryCount < maxRetries) {
      const retryDelay = 2000 * (retryCount + 1); // 2秒、4秒、6秒と増加
      console.log(`      ⚠️  Rate limit for customer ${customerId}, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return callCustomerTagApi(customerId, tag, retryCount + 1, maxRetries);
    }

    // エラーの詳細情報を収集
    const errorDetails = {
      success: false,
      customerId,
      error: error.response?.data?.error || error.message,
      errorType: error.code || error.name || 'Unknown',
      httpStatus: error.response?.status,
      errorMessage: error.message,
      fullError: error.response?.data,
      isRateLimitError
    };

    return errorDetails;
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

  // レート制限を考慮して、リクエストを順次実行（遅延付き）
  const results = [];
  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const result = await callCustomerTagApi(customer.id, tag);
    results.push(result);
    
    // 最後のリクエスト以外は遅延
    if (i < customers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
  }

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  // エラータイプ別に分類
  const rateLimitErrors = failed.filter(f => f.httpStatus === 429 || f.errorMessage?.toLowerCase().includes('rate limit'));
  const connectionErrors = failed.filter(f => f.errorType === 'ECONNREFUSED' || f.errorType === 'ECONNRESET' || f.errorType === 'ETIMEDOUT');
  const shopifyErrors = failed.filter(f => f.httpStatus >= 400 && f.httpStatus < 500 && f.httpStatus !== 429);
  const serverErrors = failed.filter(f => f.httpStatus >= 500);
  const otherErrors = failed.filter(f => 
    !rateLimitErrors.includes(f) && 
    !connectionErrors.includes(f) && 
    !shopifyErrors.includes(f) && 
    !serverErrors.includes(f)
  );

  console.log(`   ✅ Successful: ${successful.length}`);
  if (failed.length > 0) {
    console.log(`   ❌ Failed: ${failed.length}`);
    if (rateLimitErrors.length > 0) {
      console.log(`      🚫 Rate Limit Errors: ${rateLimitErrors.length}`);
    }
    if (connectionErrors.length > 0) {
      console.log(`      🔌 Connection Errors: ${connectionErrors.length}`);
    }
    if (shopifyErrors.length > 0) {
      console.log(`      📛 Client Errors (4xx): ${shopifyErrors.length}`);
    }
    if (serverErrors.length > 0) {
      console.log(`      💥 Server Errors (5xx): ${serverErrors.length}`);
    }
    if (otherErrors.length > 0) {
      console.log(`      ❓ Other Errors: ${otherErrors.length}`);
    }
    
    // 詳細なエラー情報を表示
    failed.forEach(failure => {
      const statusInfo = failure.httpStatus ? ` [HTTP ${failure.httpStatus}]` : '';
      const typeInfo = failure.errorType ? ` (${failure.errorType})` : '';
      console.log(`      Customer ${failure.customerId}${statusInfo}${typeInfo}: ${failure.error}`);
      
      // より詳細な情報があれば表示
      if (failure.fullError && typeof failure.fullError === 'object' && Object.keys(failure.fullError).length > 1) {
        console.log(`        Detail: ${JSON.stringify(failure.fullError)}`);
      }
    });
  }

  return { successful, failed, rateLimitErrors, connectionErrors, shopifyErrors, serverErrors, otherErrors };
}

async function main() {
  const tag = process.argv[2] || 'batch-processed';
  const debugMode = process.argv.includes('--debug') || process.argv.includes('-d');

  console.log(`🚀 Starting batch customer tag processing with tag: "${tag}"`);
  console.log(`📡 API Base URL: ${API_BASE_URL}`);
  console.log(`🏪 Shopify Store: ${SHOPIFY_SHOP_DOMAIN}`);
  console.log(`📦 Batch Size: ${BATCH_SIZE}`);
  console.log(`⏱️  Delay Between Batches: ${DELAY_BETWEEN_BATCHES}ms`);
  console.log(`⏱️  Delay Between Requests: ${DELAY_BETWEEN_REQUESTS}ms`);
  console.log(`🐛 Debug Mode: ${debugMode ? 'ON' : 'OFF'}`);
  console.log(`ℹ️  Note: Shopify rate limit is 2 calls/second\n`);

  try {
    const customers = await fetchAllActiveCustomers();

    if (customers.length === 0) {
      console.log('ℹ️  No customers with \'FWJカード会員\' tag found.');
      return;
    }

    const batches = [];
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      batches.push(customers.slice(i, i + BATCH_SIZE));
    }

    console.log(`\n📊 Processing ${customers.length} customers in ${batches.length} batches...\n`);

    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalRateLimitErrors = 0;
    let totalConnectionErrors = 0;
    let totalShopifyErrors = 0;
    let totalServerErrors = 0;
    let totalOtherErrors = 0;
    const allFailures = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const results = await processBatch(batch, i, tag, debugMode);

      totalSuccessful += results.successful.length;
      totalFailed += results.failed.length;
      totalRateLimitErrors += results.rateLimitErrors.length;
      totalConnectionErrors += results.connectionErrors.length;
      totalShopifyErrors += results.shopifyErrors.length;
      totalServerErrors += results.serverErrors.length;
      totalOtherErrors += results.otherErrors.length;
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

    if (totalFailed > 0) {
      console.log(`\n📊 ERROR BREAKDOWN:`);
      if (totalRateLimitErrors > 0) {
        console.log(`   🚫 Rate Limit Errors: ${totalRateLimitErrors} (${((totalRateLimitErrors / totalFailed) * 100).toFixed(1)}%)`);
      }
      if (totalConnectionErrors > 0) {
        console.log(`   🔌 Connection Errors: ${totalConnectionErrors} (${((totalConnectionErrors / totalFailed) * 100).toFixed(1)}%)`);
      }
      if (totalShopifyErrors > 0) {
        console.log(`   📛 Client Errors (4xx): ${totalShopifyErrors} (${((totalShopifyErrors / totalFailed) * 100).toFixed(1)}%)`);
      }
      if (totalServerErrors > 0) {
        console.log(`   💥 Server Errors (5xx): ${totalServerErrors} (${((totalServerErrors / totalFailed) * 100).toFixed(1)}%)`);
      }
      if (totalOtherErrors > 0) {
        console.log(`   ❓ Other Errors: ${totalOtherErrors} (${((totalOtherErrors / totalFailed) * 100).toFixed(1)}%)`);
      }
    }

    if (allFailures.length > 0) {
      console.log(`\n❌ FAILED CUSTOMERS:`);
      allFailures.forEach(failure => {
        const statusInfo = failure.httpStatus ? ` [HTTP ${failure.httpStatus}]` : '';
        const typeInfo = failure.errorType ? ` (${failure.errorType})` : '';
        console.log(`   Customer ${failure.customerId}${statusInfo}${typeInfo}: ${failure.error}`);
      });
      
      // レート制限エラーが多い場合の推奨事項
      if (totalRateLimitErrors > totalFailed * 0.3) {
        console.log(`\n💡 RECOMMENDATION:`);
        console.log(`   High rate limit errors detected. Consider:`);
        console.log(`   - Increasing DELAY_BETWEEN_BATCHES (current: ${DELAY_BETWEEN_BATCHES}ms)`);
        console.log(`   - Reducing BATCH_SIZE (current: ${BATCH_SIZE})`);
        console.log(`   - Checking Shopify API rate limits`);
      }
    }

  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}