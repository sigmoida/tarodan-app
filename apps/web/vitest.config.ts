import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * `src/` altındaki birim testleri.
 *
 * Yapılandırma OLMADAN `vitest` çalıştırıldığında `e2e/` altındaki Playwright
 * spec'lerini de topluyor ve hepsi "No test suite found" ile düşüyordu. Bu
 * yüzden testler paketin `test` script'ine hiç bağlanmamış, `src/` altındaki
 * birim testleri yıllardır CI'da KOŞMAMIŞTI. Kapsam burada açıkça daraltılır;
 * Playwright kendi koşucusunda (`test:e2e`) kalır.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
