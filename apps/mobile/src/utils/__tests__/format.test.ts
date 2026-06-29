import { asLabel, formatOrderStatus } from '../format';

/**
 * asLabel — product/[id] kategori crash fix'inin (BULGU #3) regresyon koruması.
 * Backend'den brand/scale/category string veya obje gelebilir; <Text> içine konan
 * değer asla obje olmamalı yoksa "Objects are not valid as a React child" crash'i.
 */
describe('asLabel', () => {
  it('passes through a plain string', () => {
    expect(asLabel('AutoArt')).toBe('AutoArt');
  });

  it('extracts .name from a category object', () => {
    expect(asLabel({ id: 1, name: 'Diecast', slug: 'diecast' })).toBe('Diecast');
  });

  it('falls back to title then slug when name is absent', () => {
    expect(asLabel({ title: 'Koleksiyon' })).toBe('Koleksiyon');
    expect(asLabel({ slug: 'modeller' })).toBe('modeller');
  });

  it('stringifies a number', () => {
    expect(asLabel(143)).toBe('143');
  });

  it('returns the fallback for null/undefined', () => {
    expect(asLabel(null)).toBe('');
    expect(asLabel(undefined, 'Kategori yok')).toBe('Kategori yok');
  });

  // Asıl crash senaryosu: name'in kendisi non-string (lokalize/iç içe obje).
  // Eski inline `category.name` kodu bunu doğrudan <Text>'e basıp çökerdi.
  it('does NOT return a nested object when .name is itself an object', () => {
    const localized = { name: { tr: 'Araçlar', en: 'Vehicles' } };
    const result = asLabel(localized);
    expect(typeof result).toBe('string');
    expect(result).toBe('');
  });

  // Genel güvence: dönen değer her zaman string — <Text>'e konabilir, crash imkânsız.
  it('always returns a string for any input shape', () => {
    const inputs: unknown[] = [
      'x', 0, null, undefined, {}, { name: 5 }, { name: { x: 1 } }, [], { slug: null },
    ];
    for (const v of inputs) {
      expect(typeof asLabel(v)).toBe('string');
    }
  });
});

/**
 * formatOrderStatus — satış detay banner'ı (sales/[id]) bu fonksiyonu kullanır.
 * BULGU #24 listede salesStatusConfig ile çözüldü; detay ekranında
 * awaiting_buyer_confirmation map'te eksikti → ham/İngilizce title-case fallback
 * görünüyordu. Bu testler tüm OrderStatus enum değerlerinin Türkçeleştiğini garanti eder.
 */
describe('formatOrderStatus', () => {
  // Backend prisma OrderStatus enum'unun TAM listesi (10 değer).
  const ALL_STATUSES = [
    'pending_payment', 'paid', 'preparing', 'shipped', 'delivered',
    'awaiting_buyer_confirmation', 'completed', 'cancelled',
    'refund_requested', 'refunded',
  ];

  it('her enum değerini Türkçe etikete çevirir (alt çizgi/ham enum sızdırmaz)', () => {
    for (const status of ALL_STATUSES) {
      const label = formatOrderStatus(status);
      expect(label).not.toContain('_');
      expect(label).not.toBe(status);
    }
  });

  // #24 regresyonu: eski map'te eksik olan durum artık Türkçe görünmeli.
  it('awaiting_buyer_confirmation → Türkçe (ham/İngilizce title-case değil)', () => {
    expect(formatOrderStatus('awaiting_buyer_confirmation')).toBe('Alıcı Onayı Bekleniyor');
    expect(formatOrderStatus('awaiting_buyer_confirmation', 'en')).toBe('Awaiting Buyer Confirmation');
  });

  it('null/undefined için güvenli fallback döner', () => {
    expect(formatOrderStatus(null)).toBe('Bilinmiyor');
    expect(formatOrderStatus(undefined, 'en')).toBe('Unknown');
  });
});
