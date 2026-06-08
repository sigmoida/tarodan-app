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
  // Legacy theme bridge — TarodanColors palette tanımı (ham hex burada yaşar)
  // ve onu re-export eden index.ts. Bunlar renk KAYNAĞI olduğu için raw-color
  // kuralından muaftır.
  'src/theme/index.ts',
  'src/theme/colors.ts',
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
