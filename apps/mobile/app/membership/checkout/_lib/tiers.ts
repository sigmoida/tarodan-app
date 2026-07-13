import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// API erişilemezse son çare fallback — DB MembershipTier seed değerleriyle hizalı
// (basic 49.99 / premium 99.99 / business 249.99). Normalde fiyat getTiers'tan gelir.
export const DEFAULT_MONTHLY: Record<string, number> = {
  basic: 49.99,
  premium: 99.99,
  business: 249.99,
};

// Fiyatları her zaman 2 ondalıkla göster (admin + membership/index ile aynı biçim);
// ham hesap artığı 3 ondalığı (örn. 419,916) önler → "419,92".
export const formatTL = (n: number): string =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const MEMBERSHIP_TIERS = {
  basic: {
    id: 'basic',
    name: 'Temel',
    price: 49,
    period: 'ay',
    features: [
      '15 ücretsiz ilan',
      '50 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '2 öne çıkan ilan',
    ],
    color: colors.info[600]!,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 99,
    period: 'ay',
    features: [
      '50 ücretsiz ilan',
      '200 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '10 öne çıkan ilan',
      'Reklamsız deneyim',
      'Öncelikli destek',
    ],
    color: colors.primary[600]!,
    popular: true,
  },
  business: {
    id: 'business',
    name: 'İş',
    price: 499,
    period: 'ay',
    features: [
      '200 ücretsiz ilan',
      '1000 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '50 öne çıkan ilan',
      'Reklamsız deneyim',
      'Öncelikli destek',
      'API erişimi',
      'Özel satıcı rozeti',
    ],
    color: colors.warning[500]!,
  },
};
