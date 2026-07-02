// TARO API KAPSAMLI TEST SCRIPTI
// Her endpoint, her senaryo, her edge case test edilecek
const http = require('http');

const BASE_URL = 'http://localhost:3001';
const results = [];
let testCount = 0;

// Renkli console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(test, status, details) {
  testCount++;
  const color = status === 'PASS' ? colors.green : status === 'FAIL' ? colors.red : colors.yellow;
  const result = { test, status, details };
  results.push(result);
  const detailStr = typeof details === 'object' ? JSON.stringify(details).substring(0, 150) : details;
  console.log(`${color}[${status}]${colors.reset} ${test}`);
  if (status === 'FAIL' || status === 'INFO') {
    console.log(`       ${colors.cyan}${detailStr}${colors.reset}`);
  }
}

function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// ==================== TEST DATA ====================
let userA = { token: null, id: null, email: null };
let userB = { token: null, id: null, email: null };
let categoryId = null;
let productA = { id: null };
let productB = { id: null };
let productC = { id: null }; // Teklif için
let productD = { id: null }; // Sipariş için
let productE = { id: null }; // Takas reddi için
let tradeId = null;
let trade2Id = null;
let offerId = null;
let offer2Id = null;
let addressAId = null;
let addressBId = null;
let collectionId = null;
let threadId = null;
let orderId = null;

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.cyan + '       TARO API KAPSAMLI TEST RAPORU' + colors.reset);
  console.log('='.repeat(60) + '\n');

  // ==================== FAZ 1: HEALTH & AUTH ====================
  console.log(colors.blue + '\n━━━ FAZ 1: HEALTH CHECK & AUTHENTICATION ━━━\n' + colors.reset);

  // 1.1 Health Check
  try {
    const res = await request('GET', '/api/health');
    log('1.1 Health Check', res.status === 200 ? 'PASS' : 'FAIL', res.data);
  } catch (e) { log('1.1 Health Check', 'FAIL', e.message); }

  // 1.2 Health Detailed
  try {
    const res = await request('GET', '/api/health/detailed');
    log('1.2 Health Detailed', res.status === 200 ? 'PASS' : 'FAIL', res.data);
  } catch (e) { log('1.2 Health Detailed', 'FAIL', e.message); }

  // 1.3 Register User A
  userA.email = `test_a_${Date.now()}@test.com`;
  try {
    const res = await request('POST', '/api/auth/register', {
      displayName: 'Test Kullanici A',
      email: userA.email,
      password: 'Test123456!'
    });
    if (res.status === 201 || res.status === 200) {
      userA.token = res.data.accessToken || res.data.access_token || res.data.token;
      userA.id = res.data.user?.id;
      log('1.3 Register User A', 'PASS', { id: userA.id, hasToken: !!userA.token });
    } else {
      log('1.3 Register User A', 'FAIL', res.data);
    }
  } catch (e) { log('1.3 Register User A', 'FAIL', e.message); }

  // 1.4 Register User B
  userB.email = `test_b_${Date.now()}@test.com`;
  try {
    const res = await request('POST', '/api/auth/register', {
      displayName: 'Test Kullanici B',
      email: userB.email,
      password: 'Test123456!'
    });
    if (res.status === 201 || res.status === 200) {
      userB.token = res.data.accessToken || res.data.access_token || res.data.token;
      userB.id = res.data.user?.id;
      log('1.4 Register User B', 'PASS', { id: userB.id, hasToken: !!userB.token });
    } else {
      log('1.4 Register User B', 'FAIL', res.data);
    }
  } catch (e) { log('1.4 Register User B', 'FAIL', e.message); }

  // 1.5 Duplicate Email Register (should fail)
  try {
    const res = await request('POST', '/api/auth/register', {
      displayName: 'Duplicate User',
      email: userA.email,
      password: 'Test123456!'
    });
    log('1.5 Duplicate Email Register', res.status === 400 || res.status === 409 ? 'PASS' : 'FAIL', 
        { expected: '400/409', got: res.status });
  } catch (e) { log('1.5 Duplicate Email Register', 'INFO', e.message); }

  // 1.6 Login User A
  try {
    const res = await request('POST', '/api/auth/login', {
      email: userA.email,
      password: 'Test123456!'
    });
    if (res.status === 200 || res.status === 201) {
      const newToken = res.data.accessToken || res.data.access_token || res.data.token;
      if (newToken) userA.token = newToken;
      log('1.6 Login User A', 'PASS', { hasToken: !!newToken });
    } else {
      log('1.6 Login User A', 'FAIL', res.data);
    }
  } catch (e) { log('1.6 Login User A', 'FAIL', e.message); }

  // 1.7 Login with wrong password (should fail)
  try {
    const res = await request('POST', '/api/auth/login', {
      email: userA.email,
      password: 'WrongPassword123!'
    });
    log('1.7 Wrong Password Login', res.status === 401 || res.status === 400 ? 'PASS' : 'FAIL',
        { expected: '401/400', got: res.status });
  } catch (e) { log('1.7 Wrong Password Login', 'INFO', e.message); }

  // 1.8 Get Profile User A
  if (userA.token) {
    try {
      const res = await request('GET', '/api/users/me', null, userA.token);
      log('1.8 Get Profile User A', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('1.8 Get Profile User A', 'FAIL', e.message); }
  }

  // 1.9 Get Profile without token (should fail)
  try {
    const res = await request('GET', '/api/users/me', null, null);
    log('1.9 Profile Without Token', res.status === 401 ? 'PASS' : 'FAIL',
        { expected: 401, got: res.status });
  } catch (e) { log('1.9 Profile Without Token', 'INFO', e.message); }

  // 1.10 Update Profile
  if (userA.token) {
    try {
      const res = await request('PATCH', '/api/users/me', {
        displayName: 'Test Kullanici A - Updated',
        phone: '05551112233'
      }, userA.token);
      log('1.10 Update Profile', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('1.10 Update Profile', 'FAIL', e.message); }
  }

  // ==================== FAZ 2: CATEGORIES ====================
  console.log(colors.blue + '\n━━━ FAZ 2: KATEGORILER ━━━\n' + colors.reset);

  // 2.1 Get Categories
  try {
    const res = await request('GET', '/api/categories');
    const cats = res.data.data || res.data || [];
    if (Array.isArray(cats) && cats.length > 0) {
      categoryId = cats[0].id;
      log('2.1 Get Categories', 'PASS', { count: cats.length, firstId: categoryId });
    } else {
      log('2.1 Get Categories', 'FAIL', { message: 'No categories found', data: res.data });
    }
  } catch (e) { log('2.1 Get Categories', 'FAIL', e.message); }

  // 2.2 Get Single Category
  if (categoryId) {
    try {
      const res = await request('GET', `/api/categories/${categoryId}`);
      log('2.2 Get Single Category', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('2.2 Get Single Category', 'FAIL', e.message); }
  }

  // ==================== FAZ 3: PRODUCTS ====================
  console.log(colors.blue + '\n━━━ FAZ 3: ÜRÜNLER (PRODUCTS) ━━━\n' + colors.reset);

  // 3.1 Create Product A (User A) - Trade enabled
  if (userA.token && categoryId) {
    try {
      const res = await request('POST', '/api/products', {
        title: 'Hot Wheels 69 Camaro Z28 - Test A',
        description: 'Koleksiyon parcasi, kutusu acilmamis',
        price: 250,
        categoryId: categoryId,
        condition: 'new',
        brand: 'Hot Wheels',
        scale: '1:64',
        isTradeEnabled: true
      }, userA.token);
      if (res.status === 201 || res.status === 200) {
        productA.id = res.data.id || res.data.product?.id;
        log('3.1 Create Product A (Trade Enabled)', 'PASS', { productId: productA.id });
      } else {
        log('3.1 Create Product A', 'FAIL', res.data);
      }
    } catch (e) { log('3.1 Create Product A', 'FAIL', e.message); }
  }

  // 3.2 Create Product B (User B) - Trade enabled
  if (userB.token && categoryId) {
    try {
      const res = await request('POST', '/api/products', {
        title: 'Matchbox Ferrari F40 - Test B',
        description: 'Nadir bulunan model',
        price: 180,
        categoryId: categoryId,
        condition: 'very_good',
        brand: 'Matchbox',
        scale: '1:64',
        isTradeEnabled: true
      }, userB.token);
      if (res.status === 201 || res.status === 200) {
        productB.id = res.data.id || res.data.product?.id;
        log('3.2 Create Product B (Trade Enabled)', 'PASS', { productId: productB.id });
      } else {
        log('3.2 Create Product B', 'FAIL', res.data);
      }
    } catch (e) { log('3.2 Create Product B', 'FAIL', e.message); }
  }

  // 3.3 Create Product C (User A) - For offers
  if (userA.token && categoryId) {
    try {
      const res = await request('POST', '/api/products', {
        title: 'Tomica Premium Skyline GTR - Teklif Testi',
        description: 'Teklif testi icin urun',
        price: 500,
        categoryId: categoryId,
        condition: 'new',
        isTradeEnabled: false
      }, userA.token);
      if (res.status === 201 || res.status === 200) {
        productC.id = res.data.id || res.data.product?.id;
        log('3.3 Create Product C (For Offers)', 'PASS', { productId: productC.id });
      } else {
        log('3.3 Create Product C', 'FAIL', res.data);
      }
    } catch (e) { log('3.3 Create Product C', 'FAIL', e.message); }
  }

  // 3.4 Create Product D (User A) - For orders
  if (userA.token && categoryId) {
    try {
      const res = await request('POST', '/api/products', {
        title: 'Majorette Porsche 911 - Siparis Testi',
        description: 'Siparis testi icin',
        price: 100,
        categoryId: categoryId,
        condition: 'good'
      }, userA.token);
      if (res.status === 201 || res.status === 200) {
        productD.id = res.data.id || res.data.product?.id;
        log('3.4 Create Product D (For Orders)', 'PASS', { productId: productD.id });
      } else {
        log('3.4 Create Product D', 'FAIL', res.data);
      }
    } catch (e) { log('3.4 Create Product D', 'FAIL', e.message); }
  }

  // 3.5 Create Product E (User B) - For trade reject test
  if (userB.token && categoryId) {
    try {
      const res = await request('POST', '/api/products', {
        title: 'Welly BMW M3 - Takas Red Testi',
        description: 'Takas red testi icin',
        price: 120,
        categoryId: categoryId,
        condition: 'fair',
        isTradeEnabled: true
      }, userB.token);
      if (res.status === 201 || res.status === 200) {
        productE.id = res.data.id || res.data.product?.id;
        log('3.5 Create Product E (For Trade Reject)', 'PASS', { productId: productE.id });
      } else {
        log('3.5 Create Product E', 'FAIL', res.data);
      }
    } catch (e) { log('3.5 Create Product E', 'FAIL', e.message); }
  }

  // 3.6 List Products
  try {
    const res = await request('GET', '/api/products');
    const products = res.data.data || res.data.products || res.data || [];
    log('3.6 List Products', res.status === 200 ? 'PASS' : 'FAIL', 
        { count: Array.isArray(products) ? products.length : 0 });
  } catch (e) { log('3.6 List Products', 'FAIL', e.message); }

  // 3.7 Get Product Detail
  if (productA.id) {
    try {
      const res = await request('GET', `/api/products/${productA.id}`);
      log('3.7 Get Product Detail', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('3.7 Get Product Detail', 'FAIL', e.message); }
  }

  // 3.8 Get Non-existent Product (should fail)
  try {
    const res = await request('GET', '/api/products/00000000-0000-0000-0000-000000000000');
    log('3.8 Get Non-existent Product', res.status === 404 ? 'PASS' : 'FAIL',
        { expected: 404, got: res.status });
  } catch (e) { log('3.8 Get Non-existent Product', 'INFO', e.message); }

  // 3.9 Update Product
  if (userA.token && productA.id) {
    try {
      const res = await request('PATCH', `/api/products/${productA.id}`, {
        price: 275,
        description: 'Guncellenmis aciklama'
      }, userA.token);
      log('3.9 Update Product', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('3.9 Update Product', 'FAIL', e.message); }
  }

  // 3.10 Search Products
  try {
    const res = await request('GET', '/api/products?search=Hot+Wheels');
    log('3.10 Search Products', res.status === 200 ? 'PASS' : 'FAIL', res.data);
  } catch (e) { log('3.10 Search Products', 'FAIL', e.message); }

  // 3.11 Filter by Category
  if (categoryId) {
    try {
      const res = await request('GET', `/api/products?categoryId=${categoryId}`);
      log('3.11 Filter by Category', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('3.11 Filter by Category', 'FAIL', e.message); }
  }

  // 3.12 My Products
  if (userA.token) {
    try {
      const res = await request('GET', '/api/products/my', null, userA.token);
      const products = res.data.data || res.data.products || res.data || [];
      log('3.12 My Products', res.status === 200 ? 'PASS' : 'FAIL', 
          { count: Array.isArray(products) ? products.length : 0 });
    } catch (e) { log('3.12 My Products', 'FAIL', e.message); }
  }

  // ==================== FAZ 4: ADDRESSES ====================
  console.log(colors.blue + '\n━━━ FAZ 4: ADRESLER ━━━\n' + colors.reset);

  // 4.1 Add Address (User A)
  if (userA.token) {
    try {
      const res = await request('POST', '/api/users/me/addresses', {
        fullName: 'Test Kullanici A',
        phone: '05551112233',
        city: 'Istanbul',
        district: 'Kadikoy',
        address: 'Test Mahallesi, Test Sokak No:1 D:1',
        zipCode: '34710',
        isDefault: true
      }, userA.token);
      if (res.status === 201 || res.status === 200) {
        addressAId = res.data.id || res.data.address?.id;
        log('4.1 Add Address (User A)', 'PASS', { addressId: addressAId });
      } else {
        log('4.1 Add Address (User A)', 'FAIL', res.data);
      }
    } catch (e) { log('4.1 Add Address (User A)', 'FAIL', e.message); }
  }

  // 4.2 Add Address (User B)
  if (userB.token) {
    try {
      const res = await request('POST', '/api/users/me/addresses', {
        fullName: 'Test Kullanici B',
        phone: '05554445566',
        city: 'Ankara',
        district: 'Cankaya',
        address: 'Ornek Mahallesi, Ornek Cadde No:5',
        zipCode: '06530'
      }, userB.token);
      if (res.status === 201 || res.status === 200) {
        addressBId = res.data.id || res.data.address?.id;
        log('4.2 Add Address (User B)', 'PASS', { addressId: addressBId });
      } else {
        log('4.2 Add Address (User B)', 'FAIL', res.data);
      }
    } catch (e) { log('4.2 Add Address (User B)', 'FAIL', e.message); }
  }

  // 4.3 List Addresses
  if (userA.token) {
    try {
      const res = await request('GET', '/api/users/me/addresses', null, userA.token);
      log('4.3 List Addresses', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('4.3 List Addresses', 'FAIL', e.message); }
  }

  // 4.4 Update Address
  if (userA.token && addressAId) {
    try {
      const res = await request('PATCH', `/api/users/me/addresses/${addressAId}`, {
        phone: '05559998877'
      }, userA.token);
      log('4.4 Update Address', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('4.4 Update Address', 'FAIL', e.message); }
  }

  // ==================== FAZ 5: TRADES ====================
  console.log(colors.blue + '\n━━━ FAZ 5: TAKAS SISTEMI ━━━\n' + colors.reset);

  // 5.1 Create Trade (User A -> User B)
  if (userA.token && userB.id && productA.id && productB.id) {
    try {
      const res = await request('POST', '/api/trades', {
        receiverId: userB.id,
        initiatorItems: [{ productId: productA.id, quantity: 1 }],
        receiverItems: [{ productId: productB.id, quantity: 1 }],
        message: 'Merhaba, takas yapmak ister misiniz?'
      }, userA.token);
      if (res.status === 201 || res.status === 200) {
        tradeId = res.data.id || res.data.trade?.id;
        log('5.1 Create Trade (A->B)', 'PASS', { tradeId, status: res.data.status });
      } else {
        log('5.1 Create Trade', 'FAIL', res.data);
      }
    } catch (e) { log('5.1 Create Trade', 'FAIL', e.message); }
  }

  // 5.2 List Trades (User B - should see pending)
  if (userB.token) {
    try {
      const res = await request('GET', '/api/trades', null, userB.token);
      const trades = res.data.data || res.data.trades || res.data || [];
      log('5.2 List Trades (User B)', res.status === 200 ? 'PASS' : 'FAIL', 
          { count: Array.isArray(trades) ? trades.length : 0 });
    } catch (e) { log('5.2 List Trades', 'FAIL', e.message); }
  }

  // 5.3 Get Trade Detail
  if (userB.token && tradeId) {
    try {
      const res = await request('GET', `/api/trades/${tradeId}`, null, userB.token);
      log('5.3 Get Trade Detail', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('5.3 Get Trade Detail', 'FAIL', e.message); }
  }

  // 5.4 Accept Trade (User B)
  if (userB.token && tradeId) {
    try {
      const res = await request('POST', `/api/trades/${tradeId}/accept`, {
        message: 'Takas teklifini kabul ediyorum!'
      }, userB.token);
      log('5.4 Accept Trade (User B)', res.status === 200 ? 'PASS' : 'FAIL', 
          { newStatus: res.data.status });
    } catch (e) { log('5.4 Accept Trade', 'FAIL', e.message); }
  }

  // 5.5 Create Second Trade for Reject Test
  if (userA.token && userB.id && productE.id) {
    try {
      // User A nin baska bir urunu lazim
      const prodRes = await request('POST', '/api/products', {
        title: 'Takas Red Testi Urunu',
        price: 90,
        categoryId: categoryId,
        condition: 'good',
        isTradeEnabled: true
      }, userA.token);
      const newProdId = prodRes.data.id || prodRes.data.product?.id;
      
      if (newProdId) {
        const res = await request('POST', '/api/trades', {
          receiverId: userB.id,
          initiatorItems: [{ productId: newProdId, quantity: 1 }],
          receiverItems: [{ productId: productE.id, quantity: 1 }],
          message: 'Bu takas reddedilecek'
        }, userA.token);
        if (res.status === 201 || res.status === 200) {
          trade2Id = res.data.id || res.data.trade?.id;
          log('5.5 Create Second Trade (for reject)', 'PASS', { tradeId: trade2Id });
        } else {
          log('5.5 Create Second Trade', 'FAIL', res.data);
        }
      }
    } catch (e) { log('5.5 Create Second Trade', 'FAIL', e.message); }
  }

  // 5.6 Reject Trade (User B)
  if (userB.token && trade2Id) {
    try {
      const res = await request('POST', `/api/trades/${trade2Id}/reject`, {
        reason: 'Bu urunla ilgilenmiyorum, tesekkurler.'
      }, userB.token);
      log('5.6 Reject Trade', res.status === 200 ? 'PASS' : 'FAIL', 
          { newStatus: res.data.status });
    } catch (e) { log('5.6 Reject Trade', 'FAIL', e.message); }
  }

  // ==================== FAZ 6: OFFERS ====================
  console.log(colors.blue + '\n━━━ FAZ 6: TEKLIF SISTEMI ━━━\n' + colors.reset);

  // 6.1 Create Offer (User B -> User A's product)
  if (userB.token && productC.id) {
    try {
      const res = await request('POST', '/api/offers', {
        productId: productC.id,
        amount: 400,
        message: '400 TL teklif ediyorum'
      }, userB.token);
      if (res.status === 201 || res.status === 200) {
        offerId = res.data.id || res.data.offer?.id;
        log('6.1 Create Offer (B->A)', 'PASS', { offerId, amount: 400 });
      } else {
        log('6.1 Create Offer', 'FAIL', res.data);
      }
    } catch (e) { log('6.1 Create Offer', 'FAIL', e.message); }
  }

  // 6.2 List Offers (User A - seller)
  if (userA.token) {
    try {
      const res = await request('GET', '/api/offers', null, userA.token);
      log('6.2 List Offers (Seller)', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('6.2 List Offers', 'FAIL', e.message); }
  }

  // 6.3 Get Offer Detail
  if (userA.token && offerId) {
    try {
      const res = await request('GET', `/api/offers/${offerId}`, null, userA.token);
      log('6.3 Get Offer Detail', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('6.3 Get Offer Detail', 'FAIL', e.message); }
  }

  // 6.4 Counter Offer (User A)
  if (userA.token && offerId) {
    try {
      const res = await request('POST', `/api/offers/${offerId}/counter`, {
        amount: 450
      }, userA.token);
      log('6.4 Counter Offer (450 TL)', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('6.4 Counter Offer', 'FAIL', e.message); }
  }

  // 6.5 Accept Counter Offer (User B)
  if (userB.token && offerId) {
    try {
      const res = await request('POST', `/api/offers/${offerId}/accept`, null, userB.token);
      log('6.5 Accept Counter Offer', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('6.5 Accept Counter Offer', 'FAIL', e.message); }
  }

  // 6.6 Create Second Offer (for reject test)
  let offer2ProductId = null;
  if (userA.token && categoryId) {
    try {
      const prodRes = await request('POST', '/api/products', {
        title: 'Offer Reject Test Product',
        price: 300,
        categoryId: categoryId,
        condition: 'new'
      }, userA.token);
      offer2ProductId = prodRes.data.id || prodRes.data.product?.id;
    } catch (e) {}
  }

  if (userB.token && offer2ProductId) {
    try {
      const res = await request('POST', '/api/offers', {
        productId: offer2ProductId,
        amount: 200,
        message: 'Bu teklif reddedilecek'
      }, userB.token);
      if (res.status === 201 || res.status === 200) {
        offer2Id = res.data.id || res.data.offer?.id;
        log('6.6 Create Second Offer (for reject)', 'PASS', { offerId: offer2Id });
      }
    } catch (e) { log('6.6 Create Second Offer', 'FAIL', e.message); }
  }

  // 6.7 Reject Offer (User A)
  if (userA.token && offer2Id) {
    try {
      const res = await request('POST', `/api/offers/${offer2Id}/reject`, null, userA.token);
      log('6.7 Reject Offer', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('6.7 Reject Offer', 'FAIL', e.message); }
  }

  // ==================== FAZ 7: WISHLIST ====================
  console.log(colors.blue + '\n━━━ FAZ 7: FAVORILER (WISHLIST) ━━━\n' + colors.reset);

  // 7.1 Add to Wishlist
  if (userA.token && productB.id) {
    try {
      const res = await request('POST', '/api/wishlist', { productId: productB.id }, userA.token);
      log('7.1 Add to Wishlist', (res.status === 201 || res.status === 200) ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('7.1 Add to Wishlist', 'FAIL', e.message); }
  }

  // 7.2 Get Wishlist
  if (userA.token) {
    try {
      const res = await request('GET', '/api/wishlist', null, userA.token);
      log('7.2 Get Wishlist', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('7.2 Get Wishlist', 'FAIL', e.message); }
  }

  // 7.3 Check Wishlist Item
  if (userA.token && productB.id) {
    try {
      const res = await request('GET', `/api/wishlist/check/${productB.id}`, null, userA.token);
      log('7.3 Check Wishlist Item', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('7.3 Check Wishlist Item', 'FAIL', e.message); }
  }

  // 7.4 Remove from Wishlist
  if (userA.token && productB.id) {
    try {
      const res = await request('DELETE', `/api/wishlist/${productB.id}`, null, userA.token);
      log('7.4 Remove from Wishlist', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('7.4 Remove from Wishlist', 'FAIL', e.message); }
  }

  // ==================== FAZ 8: COLLECTIONS ====================
  console.log(colors.blue + '\n━━━ FAZ 8: KOLEKSIYONLAR ━━━\n' + colors.reset);

  // 8.1 Create Collection
  if (userA.token) {
    try {
      const res = await request('POST', '/api/collections', {
        name: 'Hot Wheels Koleksiyonum',
        description: 'En degerli Hot Wheels modellerim',
        isPublic: true
      }, userA.token);
      if (res.status === 201 || res.status === 200) {
        collectionId = res.data.id || res.data.collection?.id;
        log('8.1 Create Collection', 'PASS', { collectionId });
      } else {
        log('8.1 Create Collection', 'FAIL', res.data);
      }
    } catch (e) { log('8.1 Create Collection', 'FAIL', e.message); }
  }

  // 8.2 Add Item to Collection
  if (userA.token && collectionId && productA.id) {
    try {
      const res = await request('POST', `/api/collections/${collectionId}/items`, {
        productId: productA.id,
        sortOrder: 1
      }, userA.token);
      log('8.2 Add Item to Collection', (res.status === 201 || res.status === 200) ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('8.2 Add Item to Collection', 'FAIL', e.message); }
  }

  // 8.3 Get My Collections
  if (userA.token) {
    try {
      const res = await request('GET', '/api/collections/me', null, userA.token);
      log('8.3 Get My Collections', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('8.3 Get My Collections', 'FAIL', e.message); }
  }

  // 8.4 Get Collection Detail
  if (collectionId) {
    try {
      const res = await request('GET', `/api/collections/${collectionId}`);
      log('8.4 Get Collection Detail', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('8.4 Get Collection Detail', 'FAIL', e.message); }
  }

  // 8.5 Browse Public Collections
  try {
    const res = await request('GET', '/api/collections/browse');
    log('8.5 Browse Public Collections', res.status === 200 ? 'PASS' : 'FAIL', res.data);
  } catch (e) { log('8.5 Browse Collections', 'FAIL', e.message); }

  // 8.6 Update Collection
  if (userA.token && collectionId) {
    try {
      const res = await request('PATCH', `/api/collections/${collectionId}`, {
        description: 'Guncellenmis koleksiyon aciklamasi'
      }, userA.token);
      log('8.6 Update Collection', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('8.6 Update Collection', 'FAIL', e.message); }
  }

  // ==================== FAZ 9: MESSAGING ====================
  console.log(colors.blue + '\n━━━ FAZ 9: MESAJLASMA ━━━\n' + colors.reset);

  // 9.1 Create Thread
  if (userA.token && userB.id && productB.id) {
    try {
      const res = await request('POST', '/api/messages/threads', {
        participantId: userB.id,
        productId: productB.id
      }, userA.token);
      if (res.status === 201 || res.status === 200) {
        threadId = res.data.id || res.data.thread?.id;
        log('9.1 Create Message Thread', 'PASS', { threadId });
      } else {
        log('9.1 Create Thread', 'FAIL', res.data);
      }
    } catch (e) { log('9.1 Create Thread', 'FAIL', e.message); }
  }

  // 9.2 Send Message
  if (userA.token && threadId) {
    try {
      const res = await request('POST', `/api/messages/threads/${threadId}/messages`, {
        content: 'Merhaba, urun hala satilik mi?'
      }, userA.token);
      log('9.2 Send Message', (res.status === 201 || res.status === 200) ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('9.2 Send Message', 'FAIL', e.message); }
  }

  // 9.3 Reply Message (User B)
  if (userB.token && threadId) {
    try {
      const res = await request('POST', `/api/messages/threads/${threadId}/messages`, {
        content: 'Evet, hala satilik. Ilgileniyorsaniz fiyat konusabiliriz.'
      }, userB.token);
      log('9.3 Reply Message (User B)', (res.status === 201 || res.status === 200) ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('9.3 Reply Message', 'FAIL', e.message); }
  }

  // 9.4 Get Thread Messages
  if (userA.token && threadId) {
    try {
      const res = await request('GET', `/api/messages/threads/${threadId}/messages`, null, userA.token);
      const msgs = res.data.data || res.data.messages || res.data || [];
      log('9.4 Get Thread Messages', res.status === 200 ? 'PASS' : 'FAIL', 
          { count: Array.isArray(msgs) ? msgs.length : 0 });
    } catch (e) { log('9.4 Get Thread Messages', 'FAIL', e.message); }
  }

  // 9.5 Get All Threads
  if (userA.token) {
    try {
      const res = await request('GET', '/api/messages/threads', null, userA.token);
      log('9.5 Get All Threads', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('9.5 Get All Threads', 'FAIL', e.message); }
  }

  // 9.6 Content Filter Test - Phone Number
  if (userA.token && threadId) {
    try {
      const res = await request('POST', `/api/messages/threads/${threadId}/messages`, {
        content: 'Beni 05551234567 numarasindan arayin lutfen'
      }, userA.token);
      const filtered = res.data.isFiltered || res.data.status === 'pending' || res.data.requiresApproval;
      log('9.6 Content Filter (Phone)', 'INFO', { filtered, response: res.data });
    } catch (e) { log('9.6 Content Filter', 'INFO', e.message); }
  }

  // 9.7 Content Filter Test - Email
  if (userA.token && threadId) {
    try {
      const res = await request('POST', `/api/messages/threads/${threadId}/messages`, {
        content: 'Email adresim test@gmail.com uzerinden iletisime gecebilirsiniz'
      }, userA.token);
      const filtered = res.data.isFiltered || res.data.status === 'pending' || res.data.requiresApproval;
      log('9.7 Content Filter (Email)', 'INFO', { filtered, response: res.data });
    } catch (e) { log('9.7 Content Filter', 'INFO', e.message); }
  }

  // ==================== FAZ 10: ORDERS ====================
  console.log(colors.blue + '\n━━━ FAZ 10: SIPARISLER ━━━\n' + colors.reset);

  // 10.1 Direct Buy (Buy Now)
  if (userB.token && productD.id && addressBId) {
    try {
      const res = await request('POST', '/api/orders/buy', {
        productId: productD.id,
        shippingAddressId: addressBId
      }, userB.token);
      if (res.status === 201 || res.status === 200) {
        orderId = res.data.id || res.data.order?.id || res.data.orderId;
        log('10.1 Direct Buy Order', 'PASS', { orderId, status: res.data.status });
      } else {
        log('10.1 Direct Buy Order', 'FAIL', res.data);
      }
    } catch (e) { log('10.1 Direct Buy Order', 'FAIL', e.message); }
  }

  // 10.2 List Orders (Buyer)
  if (userB.token) {
    try {
      const res = await request('GET', '/api/orders', null, userB.token);
      const orders = res.data.data || res.data.orders || res.data || [];
      log('10.2 List Orders (Buyer)', res.status === 200 ? 'PASS' : 'FAIL', 
          { count: Array.isArray(orders) ? orders.length : 0 });
    } catch (e) { log('10.2 List Orders', 'FAIL', e.message); }
  }

  // 10.3 List Orders (Seller)
  if (userA.token) {
    try {
      const res = await request('GET', '/api/orders', null, userA.token);
      log('10.3 List Orders (Seller)', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('10.3 List Orders (Seller)', 'FAIL', e.message); }
  }

  // 10.4 Get Order Detail
  if (userB.token && orderId) {
    try {
      const res = await request('GET', `/api/orders/${orderId}`, null, userB.token);
      log('10.4 Get Order Detail', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('10.4 Get Order Detail', 'FAIL', e.message); }
  }

  // ==================== FAZ 11: NOTIFICATIONS ====================
  console.log(colors.blue + '\n━━━ FAZ 11: BILDIRIMLER ━━━\n' + colors.reset);

  // 11.1 Get Notifications
  if (userA.token) {
    try {
      const res = await request('GET', '/api/notifications', null, userA.token);
      log('11.1 Get Notifications', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('11.1 Get Notifications', 'FAIL', e.message); }
  }

  // 11.2 Get Unread Count
  if (userA.token) {
    try {
      const res = await request('GET', '/api/notifications/unread-count', null, userA.token);
      log('11.2 Get Unread Count', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('11.2 Get Unread Count', 'FAIL', e.message); }
  }

  // ==================== FAZ 12: MEMBERSHIP ====================
  console.log(colors.blue + '\n━━━ FAZ 12: UYELIK ━━━\n' + colors.reset);

  // 12.1 Get Membership Tiers
  try {
    const res = await request('GET', '/api/membership/tiers');
    log('12.1 Get Membership Tiers', res.status === 200 ? 'PASS' : 'FAIL', res.data);
  } catch (e) { log('12.1 Get Membership Tiers', 'FAIL', e.message); }

  // 12.2 Get My Membership
  if (userA.token) {
    try {
      const res = await request('GET', '/api/membership/me', null, userA.token);
      log('12.2 Get My Membership', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('12.2 Get My Membership', 'FAIL', e.message); }
  }

  // 12.3 Check Listing Limit
  if (userA.token) {
    try {
      const res = await request('GET', '/api/membership/check/listing', null, userA.token);
      log('12.3 Check Listing Limit', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('12.3 Check Listing Limit', 'FAIL', e.message); }
  }

  // ==================== FAZ 13: RATINGS ====================
  console.log(colors.blue + '\n━━━ FAZ 13: DEGERLENDIRMELER ━━━\n' + colors.reset);

  // 13.1 Get User Ratings
  if (userA.id) {
    try {
      const res = await request('GET', `/api/ratings/users/${userA.id}`);
      log('13.1 Get User Ratings', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('13.1 Get User Ratings', 'FAIL', e.message); }
  }

  // 13.2 Get User Rating Stats
  if (userA.id) {
    try {
      const res = await request('GET', `/api/ratings/users/${userA.id}/stats`);
      log('13.2 Get User Rating Stats', res.status === 200 ? 'PASS' : 'FAIL', res.data);
    } catch (e) { log('13.2 Get User Rating Stats', 'FAIL', e.message); }
  }

  // ==================== SONUÇ ====================
  console.log('\n' + '='.repeat(60));
  console.log(colors.cyan + '                TEST SONUCLARI' + colors.reset);
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO').length;

  console.log(`${colors.green}GECEN:     ${passed}${colors.reset}`);
  console.log(`${colors.red}BASARISIZ: ${failed}${colors.reset}`);
  console.log(`${colors.yellow}BILGI:     ${info}${colors.reset}`);
  console.log(`TOPLAM:    ${results.length}`);
  console.log(`\nBasari Orani: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log(`\n${colors.red}━━━ BASARISIZ TESTLER ━━━${colors.reset}\n`);
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${colors.red}✗${colors.reset} ${r.test}`);
      console.log(`    ${colors.cyan}${JSON.stringify(r.details).substring(0, 100)}${colors.reset}`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

runTests().catch(console.error);
