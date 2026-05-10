/**
 * Tarodan Mobile — UI guard kuralları.
 *
 * Hedef: tüm yeni / migrate edilmiş ekranlarda UI tek kaynaktan
 * (`@tarodan/ui-native`) gelmeli, renkler `@tarodan/design-tokens` semantic
 * token'larından gelmelidir. Bu dosya:
 *
 *   1. `react-native-paper` doğrudan import'unu yasaklar
 *   2. Hex literal renkleri yasaklar (#fff, #FF8800, vs.)
 *   3. rgb() / rgba() inline string'lerini yasaklar
 *
 * Migrate edilmemiş 89 dosya `MIGRATION_OVERRIDES` listesinde whitelist'lenir.
 * Her PR migrasyonla birlikte bu listeyi KÜÇÜLTMELI. Yeni dosyalar varsayılan
 * olarak kuralın altında — eklemek için listeyi büyütmek yasak.
 */

/**
 * Henüz `@tarodan/ui-native`'e taşınmamış / paper hâlâ tüketen dosyalar.
 * Migrasyonla birlikte bu listeden çıkar. Yeni dosya EKLEME.
 */
const MIGRATION_OVERRIDES = [
  // tabs/* artık tamamen migrate edildi — override list'te yok
  'app/_layout.tsx',
  'app/about.tsx',
  'app/buyer-protection.tsx',
  'app/cart.tsx',
  'app/category/**/*.{ts,tsx}',
  'app/checkout/**/*.{ts,tsx}',
  'app/collections/**/*.{ts,tsx}',
  'app/contact.tsx',
  'app/cookies.tsx',
  'app/distance-sales.tsx',
  'app/faq.tsx',
  'app/favorites.tsx',
  'app/following.tsx',
  'app/guides.tsx',
  'app/guvenli-takas.tsx',
  'app/help.tsx',
  'app/intellectual-property.tsx',
  'app/listing/**/*.{ts,tsx}',
  'app/listings.tsx',
  'app/maintenance.tsx',
  'app/membership/**/*.{ts,tsx}',
  'app/messages/**/*.{ts,tsx}',
  'app/models/**/*.{ts,tsx}',
  'app/newsletter/**/*.{ts,tsx}',
  'app/offers/**/*.{ts,tsx}',
  'app/order-track.tsx',
  'app/orders/**/*.{ts,tsx}',
  'app/payment-options.tsx',
  'app/payment/**/*.{ts,tsx}',
  'app/pricing.tsx',
  'app/product/**/*.{ts,tsx}',
  'app/products/**/*.{ts,tsx}',
  'app/refund-policy.tsx',
  'app/returns-exchanges.tsx',
  'app/sales/**/*.{ts,tsx}',
  'app/security-features.tsx',
  'app/seller-agreement.tsx',
  'app/seller/**/*.{ts,tsx}',
  'app/settings/**/*.{ts,tsx}',
  'app/shipping-delivery.tsx',
  'app/size-guide.tsx',
  'app/statistics.tsx',
  'app/support.tsx',
  'app/trade/**/*.{ts,tsx}',
  'app/upgrade.tsx',
  // Domain components — internal Paper usage, refactor sonra
  'src/components/FeaturedListingsModal.tsx',
  'src/components/PremiumBadge.tsx',
  'src/components/RatingModal.tsx',
  'src/components/ReportModal.tsx',
  'src/components/ReputationBadge.tsx',
  'src/components/ShareModal.tsx',
  'src/components/SignupPrompt.tsx',
  'src/components/UpgradePrompt.tsx',
  'src/components/VerificationStatus.tsx',
  'src/components/common/AuthRequiredSheet.tsx',
  'src/components/common/CityDistrictSelector.tsx',
  'src/components/common/CommissionPreview.tsx',
  'src/components/common/PaperCompat.tsx',
  'src/components/common/index.ts',
  'src/components/product/AddToCollectionModal.tsx',
  'src/components/product/MakeOfferModal.tsx',
  // Tema bridge dosyaları — Paper'ı sarmaladıkları için tutuluyor
  'src/theme/index.ts',
  'src/types/paper-augmentation.d.ts',
];

/** Hex (#fff, #FF8800, #ff88aa00) ve rgb()/rgba() literal regex */
const HEX_PATTERN = '/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/';
const RGB_PATTERN = '/^rgba?\\(/';

const BAN_PAPER = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'react-native-paper',
          message:
            "react-native-paper kaldırıldı. Bunun yerine '@tarodan/ui-native'den component import et. Geçişte sorun olursa apps/mobile/.eslintrc.cjs MIGRATION_OVERRIDES'a dosyayı ekle.",
        },
      ],
    },
  ],
};

const BAN_RAW_COLOR = {
  'no-restricted-syntax': [
    'error',
    {
      selector: `Literal[value=${HEX_PATTERN}]`,
      message:
        "Hex literal renk yasak. '@tarodan/design-tokens'tan semantic token kullan (örn. colors.primary[600], colors.text.heading).",
    },
    {
      selector: `Literal[value=${RGB_PATTERN}]`,
      message:
        "rgb()/rgba() literal yasak. '@tarodan/design-tokens'tan token kullan veya StyleSheet color helper'ı yaz.",
    },
  ],
};

module.exports = {
  root: false,
  extends: ['../../.eslintrc.cjs'],
  rules: {
    ...BAN_PAPER,
    ...BAN_RAW_COLOR,
  },
  overrides: [
    {
      // Migrate edilmemiş dosyaları rule'lardan muaf tut.
      files: MIGRATION_OVERRIDES,
      rules: {
        'no-restricted-imports': 'off',
        'no-restricted-syntax': 'off',
      },
    },
  ],
};
