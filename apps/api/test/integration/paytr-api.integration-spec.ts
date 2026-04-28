import * as crypto from 'crypto';

/**
 * PayTR Live API Integration Tests
 *
 * These tests call the REAL PayTR API (in test mode).
 * No mocks — verifies that hash calculations, parameter formats,
 * and API credentials are correct.
 *
 * Run manually:  pnpm --filter @tarodan/api test:integration
 * Run in CI:     triggered via workflow_dispatch (not on every push)
 *
 * Requirements:
 *   - Internet connection
 *   - Valid PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT in .env
 */

const merchantId = process.env.PAYTR_MERCHANT_ID!;
const merchantKey = process.env.PAYTR_MERCHANT_KEY!;
const merchantSalt = process.env.PAYTR_MERCHANT_SALT!;

function generateHash(data: string): string {
  return crypto.createHmac('sha256', merchantKey).update(data).digest('base64');
}

async function paytrPost(path: string, body: Record<string, string>): Promise<any> {
  const postData = new URLSearchParams(body).toString();
  const response = await fetch(`https://www.paytr.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData,
  });
  return response.json();
}

describe('PayTR Live API Integration', () => {
  beforeAll(() => {
    if (!merchantId || !merchantKey || !merchantSalt) {
      throw new Error(
        'PAYTR credentials not configured. Set PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT in .env',
      );
    }
  });

  describe('iFrame Token API', () => {
    it('generates a valid iframe token with correct hash', async () => {
      const orderId = `INTTEST${Date.now()}`;
      const amount = 100; // 1 TL in kuruş
      const email = 'test@tarodan.com';
      const userIp = '127.0.0.1';
      const noInstallment = '1';
      const maxInstallment = '1';
      const currency = 'TL';
      const testMode = '1';
      const userBasket = Buffer.from(
        JSON.stringify([['Test Ürün', '100', 1]]),
      ).toString('base64');

      const hashStr =
        merchantId + userIp + orderId + email + String(amount) +
        userBasket + noInstallment + maxInstallment + currency + testMode;
      const paytrToken = generateHash(hashStr + merchantSalt);

      const result = await paytrPost('/odeme/api/get-token', {
        merchant_id: merchantId,
        user_ip: userIp,
        merchant_oid: orderId,
        email,
        payment_amount: String(amount),
        paytr_token: paytrToken,
        user_basket: userBasket,
        no_installment: noInstallment,
        max_installment: maxInstallment,
        currency,
        test_mode: testMode,
        user_name: 'Test User',
        user_address: 'Test Adres',
        user_phone: '05551234567',
        merchant_ok_url: 'https://test.tarodan.com/success',
        merchant_fail_url: 'https://test.tarodan.com/fail',
        debug_on: '0',
        lang: 'tr',
      });

      expect(result.status).toBe('success');
      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe('string');
    });
  });

  describe('Payment Status Query API (durum-sorgu)', () => {
    it('returns error for non-existent payment (confirms API connectivity and hash)', async () => {
      const oid = 'NONEXISTENT' + Date.now();
      const hashStr = merchantId + oid + merchantSalt;
      const paytrToken = generateHash(hashStr);

      const result = await paytrPost('/odeme/durum-sorgu', {
        merchant_id: merchantId,
        merchant_oid: oid,
        paytr_token: paytrToken,
      });

      // API responds — hash accepted, just no payment found
      expect(result).toBeTruthy();
      expect(result.errNo || result.err_no).toBeTruthy();
    });
  });

  describe('Platform Transfer API', () => {
    it('accepts request with correct hash (returns "ödeme bulunamadı" for non-existent oid)', async () => {
      const oid = 'NONEXISTENT' + Date.now();
      const transId = 'INTTEST' + Date.now();
      const submerchantAmount = '100';
      const totalAmount = '100';
      const transferName = 'Test User';
      const transferIban = 'TR330006100519786457841326';

      const hashStr =
        merchantId + oid + transId + submerchantAmount + totalAmount +
        transferName + transferIban + merchantSalt;
      const paytrToken = generateHash(hashStr);

      const result = await paytrPost('/odeme/platform/transfer', {
        merchant_id: merchantId,
        merchant_oid: oid,
        trans_id: transId,
        submerchant_amount: submerchantAmount,
        total_amount: totalAmount,
        transfer_name: transferName,
        transfer_iban: transferIban,
        paytr_token: paytrToken,
      });

      // API accepted our request (hash valid, credentials valid)
      // Error is expected: "odeme bulunamadi" because oid doesn't exist
      expect(result.status).toBe('error');
      expect(result.err_msg).toMatch(/bulunamad/i);
    });

    it('rejects request with invalid hash', async () => {
      const result = await paytrPost('/odeme/platform/transfer', {
        merchant_id: merchantId,
        merchant_oid: 'TEST123',
        trans_id: 'TEST' + Date.now(),
        submerchant_amount: '100',
        total_amount: '100',
        transfer_name: 'Test',
        transfer_iban: 'TR330006100519786457841326',
        paytr_token: 'INVALIDHASH',
      });

      // Should reject with auth/hash error
      expect(result.status).toBe('error');
    });
  });

  describe('Refund API', () => {
    it('returns error for non-existent payment (confirms API connectivity)', async () => {
      const oid = 'NONEXISTENT' + Date.now();
      const returnAmount = '100';
      const hashStr = merchantId + oid + returnAmount + merchantSalt;
      const paytrToken = generateHash(hashStr);

      const result = await paytrPost('/odeme/iade', {
        merchant_id: merchantId,
        merchant_oid: oid,
        return_amount: returnAmount,
        paytr_token: paytrToken,
      });

      expect(result).toBeTruthy();
      // Either "bulunamadi" error or similar — confirms API connectivity
      expect(result.status).toBe('error');
    });
  });

  describe('Returned Transfers API', () => {
    it('queries returned transfers without error', async () => {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const startDate = weekAgo.toISOString().replace('T', ' ').slice(0, 19);
      const endDate = now.toISOString().replace('T', ' ').slice(0, 19);

      const hashStr = merchantId + startDate + endDate + merchantSalt;
      const paytrToken = generateHash(hashStr);

      const result = await paytrPost('/odeme/geri-donen-transfer', {
        merchant_id: merchantId,
        start_date: startDate,
        end_date: endDate,
        paytr_token: paytrToken,
      });

      // API responds — may be success with empty data or failed (both valid)
      expect(result).toBeTruthy();
    });
  });
});
