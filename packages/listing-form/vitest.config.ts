import { defineConfig } from "vitest/config";

/**
 * Paketin kendi birim testleri.
 *
 * Bu dosyalar `apps/web` içindeyken web'in vitest'i topluyordu; pakete taşınınca
 * hiçbir koşucunun kapsamında kalmıyorlardı. Testin sessizce koşmaz hale
 * gelmesi, hiç olmamasından kötüdür — bu yüzden paket kendi koşucusunu taşır ve
 * CI'da `turbo run test` ile birlikte çalışır.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Varsayılan node; hook testi dosya başındaki `// @vitest-environment jsdom`
    // ile kendi ortamını seçer.
    environment: "node",
  },
});
