import type { ValidationPipeOptions } from "@nestjs/common";

/**
 * Global ValidationPipe ayarları — TEK kaynak: `main.ts`, e2e uygulaması
 * (`test/test-utils/create-app.ts`) ve DTO dönüşüm spec'leri aynı nesneyi
 * kullanır. Spec'ler gerçek ayarlarla koşmazsa `enableImplicitConversion`
 * gibi davranışı değiştiren bir bayrağın etkisi testte görünmez.
 */
export const GLOBAL_VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: false, // Changed to false to prevent 500 errors
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};
