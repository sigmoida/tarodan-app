import { describe, expect, it } from "vitest";
import {
  FORWARDED_REQUEST_HEADERS,
  FORWARDED_RESPONSE_HEADERS,
  GATEWAY_CLIENT_IP_HEADER,
  gatewayClientIp,
} from "./proxy";

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

  it("dışa aktarım kırpma başlığını tarayıcıya geri taşır", () => {
    // Taşınmazsa panel kırpılmış Excel'i tam sanır — uyarı hiç çıkmaz.
    expect(FORWARDED_RESPONSE_HEADERS).toContain("x-export-truncated-at");
  });
});

describe("gateway client IP (onay kaydı kanıtı)", () => {
  it("başlık adı API ile sözleşmelidir (@tarodan/types GATEWAY_CLIENT_IP_HEADER)", () => {
    expect(GATEWAY_CLIENT_IP_HEADER).toBe("x-tarodan-client-ip");
  });

  it("tarayıcının kendi gönderdiği istemci-IP başlığı yukarı taşınmaz", () => {
    expect(FORWARDED_REQUEST_HEADERS).not.toContain(GATEWAY_CLIENT_IP_HEADER);
  });

  it("kullanıcı ajanı kanıt için taşınır", () => {
    expect(FORWARDED_REQUEST_HEADERS).toContain("user-agent");
  });

  it("X-Forwarded-For'un en sağdaki (vekilin eklediği) girdisini alır", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 85.105.10.20",
    });
    expect(gatewayClientIp(headers)).toBe("85.105.10.20");
  });

  it("X-Forwarded-For yoksa X-Real-IP'ye düşer", () => {
    expect(gatewayClientIp(new Headers({ "x-real-ip": "85.105.10.21" }))).toBe(
      "85.105.10.21",
    );
  });

  it("vekil başlığı hiç yoksa null döner", () => {
    expect(gatewayClientIp(new Headers())).toBeNull();
  });
});
