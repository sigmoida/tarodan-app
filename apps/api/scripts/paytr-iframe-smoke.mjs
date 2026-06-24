#!/usr/bin/env node
/**
 * PayTR iFrame get-token smoke — creds + HMAC kodumuzun doğruluğunu kanıtlar.
 * iFrame üretimde ÇALIŞTIĞINDAN bu test başarılıysa: creds + key/salt + HMAC %100 doğru demektir.
 * Eğer iframe SUCCESS ama Direct API "token gecersiz" diyorsa → sorun hash değil,
 * büyük olasılıkla hesapta DIRECT API YETKİSİNİN KAPALI olmasıdır.
 */
import crypto from 'node:crypto';

const merchantId = process.env.PAYTR_MERCHANT_ID;
const merchantKey = process.env.PAYTR_MERCHANT_KEY;
const merchantSalt = process.env.PAYTR_MERCHANT_SALT;
if (!merchantId || !merchantKey || !merchantSalt) {
  console.error('❌ PAYTR_MERCHANT_ID/KEY/SALT gerekli.');
  process.exit(1);
}

const merchantOid = `IFRSMOKE${Date.now()}`;
const userIp = '85.34.78.112';
const email = 'test@tarodan.com';
const paymentAmount = String(Math.round(10 * 100)); // kuruş
const noInstallment = '0';
const maxInstallment = '0';
const currency = 'TL';
const testMode = '1';
const userBasket = Buffer.from(JSON.stringify([['Smoke Urun', '10.00', 1]])).toString('base64');

// iFrame hash: merchant_id+user_ip+merchant_oid+email+payment_amount+user_basket+no_installment+max_installment+currency+test_mode
const hashStr =
  merchantId + userIp + merchantOid + email + paymentAmount + userBasket + noInstallment + maxInstallment + currency + testMode;
const paytrToken = crypto.createHmac('sha256', merchantKey).update(hashStr + merchantSalt).digest('base64');

const form = new URLSearchParams({
  merchant_id: merchantId,
  user_ip: userIp,
  merchant_oid: merchantOid,
  email,
  payment_amount: paymentAmount,
  paytr_token: paytrToken,
  user_basket: userBasket,
  debug_on: '1',
  no_installment: noInstallment,
  max_installment: maxInstallment,
  user_name: 'PayTR Test',
  user_address: 'Test adres',
  user_phone: '+905000000000',
  merchant_ok_url: 'https://tarodan.com/payment/success',
  merchant_fail_url: 'https://tarodan.com/payment/fail',
  timeout_limit: '30',
  currency,
  test_mode: testMode,
});

console.log(`▶ iFrame get-token test isteği… (oid=${merchantOid})`);
const res = await fetch('https://www.paytr.com/odeme/api/get-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form.toString(),
  signal: AbortSignal.timeout(20000),
});
const text = await res.text();
const m = text.match(/\{[\s\S]*\}/);
const json = m ? JSON.parse(m[0]) : null;
if (json?.status === 'success') {
  console.log('✅ iFrame get-token SUCCESS → creds + HMAC %100 doğru. (token alındı)');
} else {
  console.log(`❌ iFrame get-token başarısız: ${json ? JSON.stringify(json) : text.slice(0, 300)}`);
}
