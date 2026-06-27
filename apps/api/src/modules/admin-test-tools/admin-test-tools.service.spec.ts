import { computeTargetDate, tradeDeadlineField } from './admin-test-tools.service';

/**
 * Zaman makinesi saf mantığı: aksiyon→tarih hesabı ve takas durum→deadline eşlemesi.
 */
describe('AdminTestTools saf mantık', () => {
  const now = 1_750_000_000_000; // sabit referans

  describe('computeTargetDate', () => {
    it('expire_now → now', () => {
      expect(computeTargetDate('expire_now', 0, now).getTime()).toBe(now);
    });
    it('set_minutes → now + N dk', () => {
      expect(computeTargetDate('set_minutes', 5, now).getTime()).toBe(now + 5 * 60_000);
    });
    it('backdate_days → now - N gün', () => {
      expect(computeTargetDate('backdate_days', 3, now).getTime()).toBe(now - 3 * 86_400_000);
    });
    it('ondalık dakika yuvarlanır', () => {
      expect(computeTargetDate('set_minutes', 1.4, now).getTime()).toBe(now + 1 * 60_000);
    });
  });

  describe('tradeDeadlineField', () => {
    it('awaiting_payment → paymentDeadline', () => {
      expect(tradeDeadlineField('awaiting_payment')).toBe('paymentDeadline');
    });
    it('accepted / shipping_to_warehouse → shippingDeadline', () => {
      expect(tradeDeadlineField('accepted')).toBe('shippingDeadline');
      expect(tradeDeadlineField('shipping_to_warehouse')).toBe('shippingDeadline');
    });
    it('pending / bilinmeyen → responseDeadline', () => {
      expect(tradeDeadlineField('pending')).toBe('responseDeadline');
      expect(tradeDeadlineField('whatever')).toBe('responseDeadline');
    });
  });
});
