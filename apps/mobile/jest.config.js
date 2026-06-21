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
    // jest-expo preset'inin mevcut mapping'leri (jest-expo/jest-preset.js'den)
    '^@/(.*)$': '<rootDir>//src/$1',
    '^@components/(.*)$': '<rootDir>//src/components/$1',
    '^@screens/(.*)$': '<rootDir>//src/screens/$1',
    '^@services/(.*)$': '<rootDir>//src/services/$1',
    '^@stores/(.*)$': '<rootDir>//src/stores/$1',
    '^@navigation/(.*)$': '<rootDir>//src/navigation/$1',
    '^react-native-vector-icons$': '@expo/vector-icons',
    '^react-native-vector-icons/(.*)': '@expo/vector-icons/$1',
    // React tekil örnek zorlaması — dispatcher uyumsuzluğu hatasını önler
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
    '^react-test-renderer$': '<rootDir>/../../node_modules/react-test-renderer',
    '^react-test-renderer/(.*)$': '<rootDir>/../../node_modules/react-test-renderer/$1',
  },
};
