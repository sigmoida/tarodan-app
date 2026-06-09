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
};
