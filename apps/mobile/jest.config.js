/**
 * Mobil komponent/birim testleri — jest-expo + React Native Testing Library.
 * Detay: docs/superpowers/specs/mobile-test-strategy.md
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // pnpm: gerçek paket dosyaları node_modules/.pnpm/<pkg>@ver/node_modules/<pkg> altında.
  // .pnpm segmentinden sonra istisna-dışı paketleri ignore et (transform etme); RN/expo/
  // workspace paketlerini istisna tut. (Tek, backtrack'siz pattern.)
  transformIgnorePatterns: [
    'node_modules/\\.pnpm/(?!(react-native|@react-native|expo|@expo|react-navigation|@react-navigation|@react-native-async-storage|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|@unimodules|unimodules|sentry-expo|@sentry|native-base|@expo-google-fonts|@tanstack|@tarodan))',
  ],
  // Salt komponent/birim testleri (Maestro/detox hariç).
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
  // pnpm monorepo'da birden fazla React kopyası var:
  //   - apps/mobile/node_modules/react → 19.1.0 (uygulamanın kullandığı)
  //   - root/node_modules/react → 18.3.1
  //   - @testing-library/react-native/node_modules/react → 19.1.0 (iç kopya)
  //   - react-test-renderer/node_modules/react → 19.1.0 (iç kopya)
  // Jest, moduleNameMapper'dan önce iç nested modülleri çözüyor; bu yüzden
  // @testing-library ve react-test-renderer kendi react kopyalarını kullanıyor
  // ve "Invalid hook call / mismatching versions" dispatcher hatası oluşuyor.
  // Tüm react import'larını apps/mobile/node_modules/react'a (tek, 19.1.0) yönlendir.
  // (Metro config'deki resolver.resolveRequest düzeltmesinin Jest karşılığı.)
  moduleNameMapper: {
    // jest-expo preset'inin kendi mapping'lerini olduğu gibi devral (üzerine
    // yazıp düşürmemek için spread — top-level moduleNameMapper preset'inkini
    // değiştirir, merge etmez).
    ...(require('jest-expo/jest-preset').moduleNameMapper ?? {}),
    // Path alias `@/*` → `src/*`. Metro (Expo SDK 54) tsconfig `paths`'i runtime'da
    // otomatik çözer; Jest çözmez, bu yüzden burada elle eşliyoruz. tsconfig.json ile
    // tek kaynak.
    '^@/(.*)$': '<rootDir>/src/$1',
    // `@tarodan/shared` ui-native'in dependency'si (ui-native Badge/status-configs
    // onu import ediyor) ama son `pnpm install`'dan sonra eklendiği için mobile'da
    // symlink oluşmadı → Jest çözemiyor. Workspace kaynağına elle eşle (paket
    // tamamen self-contained; dış importu yok). Kalıcı çözüm: `pnpm install`.
    '^@tarodan/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@tarodan/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    // React tekil örnek zorlaması — pnpm monorepo'da birden fazla React kopyası
    // (root 18.3.1 vs apps/mobile 19.1.0, + @testing-library/react-test-renderer
    // iç kopyaları) dispatcher uyumsuzluğu/render crash'ine yol açıyor. Tüm
    // react import'larını tek kopyaya yönlendir. (metro.config.js'deki
    // resolver.resolveRequest düzeltmesinin Jest karşılığı.)
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
    '^react-test-renderer$': '<rootDir>/../../node_modules/react-test-renderer',
    '^react-test-renderer/(.*)$': '<rootDir>/../../node_modules/react-test-renderer/$1',
  },
};
