import { describe, expect, it } from "vitest";
import { FORWARDED_REQUEST_HEADERS } from "./proxy";

/**
 * Gateway başlık safelist'i sözleşmedir: burada olmayan başlık istemciden
 * API'ye ULAŞMAZ ve hata, başlığı okuyan uçta "eksik alan" gibi görünür —
 * gerçek sebep proxy olduğu için de yanlış yerde aranır.
 *
 * `idempotency-key` tam olarak bunu yaşadı: toplu ürün yükleme istemcide
 * doğru, API'de doğruydu; arada düştüğü için canlıda hiç çalışmadı.
 */
describe("gateway forwarded headers", () => {
  it("uçtan uca gereken başlıkları taşır", () => {
    for (const header of [
      "content-type",
      "accept",
      "cache-control",
      "pragma",
      "idempotency-key",
    ]) {
      expect(FORWARDED_REQUEST_HEADERS).toContain(header);
    }
  });

  it("tarayıcı kimlik bilgisini yukarı taşımaz", () => {
    // Yetki sunucu tarafında Bearer ile ekleniyor; bunların taşınması
    // tarayıcı oturumunu API'ye sızdırırdı.
    for (const header of ["authorization", "cookie", "host"]) {
      expect(FORWARDED_REQUEST_HEADERS).not.toContain(header);
    }
  });

  it("safelist küçük harfle tutulur — Headers.get() büyük/küçük duyarsızdır ama liste tutarlı kalmalı", () => {
    for (const header of FORWARDED_REQUEST_HEADERS) {
      expect(header).toBe(header.toLowerCase());
    }
  });
});
