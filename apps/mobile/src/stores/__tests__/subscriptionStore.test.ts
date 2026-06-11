/**
 * J108 · Abonelik durum türetme yardımcıları (saf mantık birim testi).
 * Otomatik yenileme / iptal akışının UI'ı bu saf fonksiyonların çıktısına göre
 * render eder: isSubscriptionActive, getDaysUntilRenewal, formatBillingPeriod,
 * getSubscriptionStatusText. Backend abonelik mantığı (tahsilat, webhook) hariç.
 */
import {
  isSubscriptionActive,
  getDaysUntilRenewal,
  formatBillingPeriod,
  getSubscriptionStatusText,
  isPremiumTier,
  type Subscription,
  type MembershipTier,
} from '../subscriptionStore';

const makeSub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's1',
  userId: 'u1',
  tierId: 'premium',
  tier: {} as MembershipTier,
  status: 'active',
  billingPeriod: 'monthly',
  currentPeriodStart: new Date(Date.now() - 86400000).toISOString(),
  currentPeriodEnd: new Date(Date.now() + 10 * 86400000).toISOString(),
  cancelledAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

describe('J108 · subscriptionStore saf yardımcılar', () => {
  it('isSubscriptionActive: aktif + dönem sonu gelecekte ise true', () => {
    expect(isSubscriptionActive(makeSub())).toBe(true);
  });

  it('isSubscriptionActive: null abonelik → false', () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it('isSubscriptionActive: dönem sonu geçmişte ise false', () => {
    const past = makeSub({ currentPeriodEnd: new Date(Date.now() - 86400000).toISOString() });
    expect(isSubscriptionActive(past)).toBe(false);
  });

  it('isSubscriptionActive: status cancelled ise false (aktif değil)', () => {
    expect(isSubscriptionActive(makeSub({ status: 'cancelled' }))).toBe(false);
  });

  it('getDaysUntilRenewal: kalan gün pozitif yuvarlanır', () => {
    const sub = makeSub({ currentPeriodEnd: new Date(Date.now() + 5 * 86400000).toISOString() });
    expect(getDaysUntilRenewal(sub)).toBe(5);
  });

  it('getDaysUntilRenewal: null → 0', () => {
    expect(getDaysUntilRenewal(null)).toBe(0);
  });

  it('formatBillingPeriod: monthly/yearly TR metni', () => {
    expect(formatBillingPeriod('monthly')).toBe('Aylık');
    expect(formatBillingPeriod('yearly')).toBe('Yıllık');
  });

  it('getSubscriptionStatusText: durum metinleri', () => {
    expect(getSubscriptionStatusText('active').text).toBe('Aktif');
    expect(getSubscriptionStatusText('cancelled').text).toBe('İptal Edildi');
    expect(getSubscriptionStatusText('past_due').text).toBe('Ödeme Gecikmiş');
    expect(getSubscriptionStatusText('expired').text).toBe('Süresi Doldu');
  });

  it('isPremiumTier: premium/business true, free false', () => {
    expect(isPremiumTier({ type: 'premium' } as MembershipTier)).toBe(true);
    expect(isPremiumTier({ type: 'business' } as MembershipTier)).toBe(true);
    expect(isPremiumTier({ type: 'free' } as MembershipTier)).toBe(false);
    expect(isPremiumTier(null)).toBe(false);
  });
});
