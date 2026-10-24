import assert from "node:assert/strict";
import test from "node:test";
import {
  replaySampleRates,
  shouldRecordReplay,
} from "../src/lib/replayPolicy.mjs";

/**
 * Sentry Session Replay ödeme sayfasında ÇALIŞMAMALI.
 *
 * Replay varsayılan olarak metin ve input'ları maskeler, yani kart verisi
 * doğrudan sızmaz; ancak PayTR Direkt API'de kart alanları BİZİM sayfamızda
 * toplandığı için o sayfa PCI DSS 6.4.3 kapsamındadır ve DOM kaydeden bir
 * script'i orada bulundurmayı gerekçelendirmek gerekir. Kaydı hiç başlatmamak
 * hem script yüzeyini hem de gerekçelendirme yükünü ortadan kaldırır.
 */

test("does not record on the payment page, with or without a locale prefix", () => {
  assert.equal(shouldRecordReplay("/payment/abc"), false);
  assert.equal(shouldRecordReplay("/en/payment/abc"), false);
});

test("records normally everywhere else", () => {
  for (const path of ["/", "/checkout", "/profile/orders", "/en/products/1"]) {
    assert.equal(shouldRecordReplay(path), true, path);
  }
});

test("treats an unknown path as recordable (SSR/no-DOM default)", () => {
  // Sunucuda pathname yoktur; init o an replay'i kurar, rota koruması SPA
  // gezinmesinde devreye girer.
  assert.equal(shouldRecordReplay(undefined), true);
});

test("zeroes both sample rates on the payment page in every environment", () => {
  for (const env of ["production", "staging", "development", undefined]) {
    assert.deepEqual(replaySampleRates("/payment/abc", env), {
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    assert.deepEqual(replaySampleRates("/en/payment/abc", env), {
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  }
});

test("takes the rates from the environment table elsewhere", () => {
  assert.deepEqual(replaySampleRates("/products/1", "production"), {
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
  });
  for (const env of ["staging", "development", "unknown", undefined]) {
    assert.deepEqual(replaySampleRates("/products/1", env), {
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  }
});
