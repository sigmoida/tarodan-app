import { describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import {
  createBffProxy,
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
      "x-payment-capability",
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

  it("dışa aktarımın kayıt sayısını ve no-store önbellek kuralını taşır", () => {
    // Kişisel veri taşıyan döküm tarayıcı önbelleğinde kalmamalı; kayıt
    // sayısı panelin "N kayıt indirildi" bildirimini besler.
    expect(FORWARDED_RESPONSE_HEADERS).toContain("x-export-row-count");
    expect(FORWARDED_RESPONSE_HEADERS).toContain("cache-control");
  });

  it("yanıt safelist'i de küçük harfle tutulur", () => {
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      expect(header).toBe(header.toLowerCase());
    }
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

describe("gateway proxy request forwarding", () => {
  async function forward(headers: Record<string, string>) {
    const apiFetch = vi.fn(async (_path: string, _init?: RequestInit) => ({
      res: new Response("{}", { status: 200 }),
    }));
    const { POST } = createBffProxy({
      apiFetch,
      attachSessionCookies: (_res: NextResponse) => undefined,
    });
    const request = new NextRequest(
      "https://tarodan.test/gateway/payments/direct-form",
      {
        method: "POST",
        headers: {
          host: "tarodan.test",
          origin: "https://tarodan.test",
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ paymentId: "p1" }),
      },
    );
    await POST(request, {
      params: Promise.resolve({ path: ["payments", "direct-form"] }),
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0];
    return { path, headers: new Headers(init?.headers) };
  }

  it("ödeme yetki başlığını (X-Payment-Capability) API'ye taşır", async () => {
    // Misafir kart ödemesi bu başlık olmadan API'den 403 alıyordu.
    const { path, headers } = await forward({
      "X-Payment-Capability": "cap-token",
    });
    expect(path).toBe("/payments/direct-form");
    expect(headers.get("x-payment-capability")).toBe("cap-token");
  });

  it("safelist dışındaki başlıkları ve tarayıcı kimlik bilgisini taşımaz", async () => {
    const { headers } = await forward({
      "x-evil": "1",
      "x-payment-capability-extra": "1",
      authorization: "Bearer browser",
      cookie: "web_at=a1",
      [GATEWAY_CLIENT_IP_HEADER]: "6.6.6.6",
    });
    expect(headers.get("x-evil")).toBeNull();
    expect(headers.get("x-payment-capability-extra")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    // Tarayıcının uydurduğu istemci-IP başlığı yukarı taşınmaz (vekil başlığı
    // olmadığı için gateway de kendi değerini koymaz).
    expect(headers.get(GATEWAY_CLIENT_IP_HEADER)).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
  });
});
