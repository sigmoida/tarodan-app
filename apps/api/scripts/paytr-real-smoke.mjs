#!/usr/bin/env node
/**
 * PayTR GERÇEK Direct API smoke testi.
 *
 * Amaç: "PayTR bizi kabul ediyor mu?" sorusunu GERÇEK bir test isteğiyle yanıtlamak.
 * Bizim createDirectPayment'taki HASH/parametre kurgusunun BİREBİR aynısını kullanır
 * (apps/api/src/modules/payment-providers/paytr.service.ts ile uyumlu).
 *
 * Bu script callback URL GEREKTİRMEZ: 3D Secure (non_3d=0) yanıtı SENKRON döner —
 * HTML dönerse PayTR isteğimizi kabul etti (hash/parametreler doğru) demektir.
 * Hata JSON'u dönerse `reason` alanı nedeni söyler.
 *
 * KULLANIM:
 *   PAYTR_MERCHANT_ID=xxx PAYTR_MERCHANT_KEY=yyy PAYTR_MERCHANT_SALT=zzz \
 *   PAYTR_TEST_MODE=true node apps/api/scripts/paytr-real-smoke.mjs
 *
 * Test kartı: PayTR dokümanındaki başarı kartı (panel/PDF'ten teyit et).
 * GERÇEK kart KULLANMA — test_mode=1 ile para çekilmez.
 */
import crypto from 'node:crypto';

const merchantId = process.env.PAYTR_MERCHANT_ID;
const merchantKey = process.env.PAYTR_MERCHANT_KEY;
const merchantSalt = process.env.PAYTR_MERCHANT_SALT;
const testMode = ['1', 'true', 'yes'].includes(String(process.env.PAYTR_TEST_MODE || '').toLowerCase());

if (!merchantId || !merchantKey || !merchantSalt) {
  console.error('❌ PAYTR_MERCHANT_ID / KEY / SALT env değişkenleri gerekli.');
  process.exit(1);
}
if (!testMode) {
  console.error('❌ Güvenlik: bu smoke testi yalnız PAYTR_TEST_MODE=true ile çalışır (gerçek para çekme yok).');
  process.exit(1);
}

// --- Test verileri ---
const merchantOid = `SMOKE${Date.now()}`;
const email = 'test@tarodan.com';
const amountTl = 10.0; // 10 TL
const paymentAmount = String(Math.round(amountTl * 100)); // kuruş
const userIp = '85.34.78.112'; // dış IP (lokal IP PayTR'ce reddedilir)
const paymentType = 'card';
const installmentCount = '0';
const currency = 'TL';
const testModeStr = '1';
const non3d = '0'; // 3D → senkron HTML yanıtı (kabul kanıtı). Non3D için PayTR yetkisi gerekir.

// PayTR test kartı (başarı). Panel/PDF'ten doğrula.
const card = { number: '4355084355084358', month: '12', year: '26', cvv: '000', holder: 'PAYTR TEST' };

// hashStr = merchant_id + user_ip + merchant_oid + email + payment_amount + payment_type
//           + installment_count + currency + test_mode + non_3d   (createDirectPayment ile aynı)
const hashStr =
  merchantId + userIp + merchantOid + email + paymentAmount + paymentType + installmentCount + currency + testModeStr + non3d;
const paytrToken = crypto.createHmac('sha256', merchantKey).update(hashStr + merchantSalt).digest('base64');

const basket = JSON.stringify([['Smoke Test Ürün', (amountTl * 100).toFixed(0), 1]])
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const form = new URLSearchParams({
  merchant_id: merchantId,
  user_ip: userIp,
  merchant_oid: merchantOid,
  email,
  payment_amount: paymentAmount,
  payment_type: paymentType,
  installment_count: installmentCount,
  currency,
  test_mode: testModeStr,
  non_3d: non3d,
  paytr_token: paytrToken,
  cc_owner: card.holder,
  card_number: card.number,
  expiry_month: card.month,
  expiry_year: card.year,
  cvv: card.cvv,
  merchant_ok_url: 'https://tarodan.com/payment/success',
  merchant_fail_url: 'https://tarodan.com/payment/fail',
  user_name: 'PayTR Test',
  user_address: 'Test Mah. Test Cad. No:1',
  user_phone: '+905000000000',
  user_basket: basket,
  debug_on: '1',
  client_lang: 'tr',
  no_installment: '0',
  max_installment: '0',
  lang: 'tr',
  timeout_limit: '30',
});

console.log(`▶ PayTR Direct API (3D) test isteği gönderiliyor… (oid=${merchantOid}, ${amountTl} TL, test_mode=1)`);

try {
  const res = await fetch('https://www.paytr.com/odeme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed);
    if (json.status === 'success') {
      console.log('✅ PayTR isteği KABUL ETTİ (status=success). Entegrasyon/hash doğru.');
    } else {
      console.log(`⚠️  PayTR hata döndürdü: status=${json.status} reason="${json.reason || json.err_msg}"`);
      console.log('   (Hash doğruysa bu genelde yetki/parametre kaynaklı — reason’a bak.)');
    }
    console.log(JSON.stringify(json, null, 2));
  } else if (/<form|<html|3d|secure|<script/i.test(trimmed)) {
    console.log('✅ PayTR 3D Secure HTML döndürdü → isteğimiz KABUL EDİLDİ (hash/parametreler doğru).');
    console.log(`   HTML uzunluğu: ${trimmed.length} karakter (ilk 200): ${trimmed.slice(0, 200)}…`);
  } else {
    console.log(`❓ Beklenmeyen yanıt (HTTP ${res.status}). İlk 400 karakter:`);
    console.log(trimmed.slice(0, 400));
  }
} catch (e) {
  console.error('❌ İstek hatası:', e?.message || e);
  process.exit(1);
}
