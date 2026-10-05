import { GATEWAY_CLIENT_IP_HEADER } from "@tarodan/types";
import {
  getRequestClientInfo,
  getRequestId,
  requestIdMiddleware,
  runWithRequestId,
} from "./request-context";

/**
 * Korelasyon kimliği: bir isteğin ürettiği TÜM izler (konsol satırları, Sentry
 * olayı, error_logs satırı, istemciye dönen 500 gövdesi) tek bir kimlikle
 * bağlanır. Olmadığında "şu 500'ün öncesinde ne oldu" sorusu zaman damgası
 * tahminine kalıyordu.
 *
 * Taşıyıcı AsyncLocalStorage: eşzamanlı istekler birbirinin kimliğini GÖRMEZ —
 * global bir değişken bu yüzden kullanılamaz.
 */
describe("request context", () => {
  const makeRes = () => {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
  };

  it("bağlam dışında kimlik yoktur (undefined döner, patlamaz)", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("bağlam içindeki her okuma aynı kimliği verir", () => {
    runWithRequestId("req-1", () => {
      expect(getRequestId()).toBe("req-1");
      expect(getRequestId()).toBe("req-1");
    });
  });

  it("eşzamanlı akışlar birbirinin kimliğini görmez", async () => {
    const seen: string[] = [];
    const flow = (id: string) =>
      new Promise<void>((resolve) =>
        runWithRequestId(id, async () => {
          await new Promise((r) => setTimeout(r, 5));
          seen.push(getRequestId()!);
          resolve();
        }),
      );

    await Promise.all([flow("a"), flow("b"), flow("c")]);

    expect(seen.sort()).toEqual(["a", "b", "c"]);
  });

  it("middleware kimlik üretir, yanıt başlığına yazar ve bağlamı açar", () => {
    const res = makeRes();
    let inside: string | undefined;

    requestIdMiddleware({ headers: {} } as any, res as any, () => {
      inside = getRequestId();
    });

    expect(inside).toBeTruthy();
    expect(res.headers["X-Request-Id"]).toBe(inside);
  });

  it("gelen X-Request-Id başlığı KORUNUR (proxy/istemci zinciri sürsün)", () => {
    const res = makeRes();
    let inside: string | undefined;

    requestIdMiddleware(
      { headers: { "x-request-id": "upstream-42" } } as any,
      res as any,
      () => {
        inside = getRequestId();
      },
    );

    expect(inside).toBe("upstream-42");
    expect(res.headers["X-Request-Id"]).toBe("upstream-42");
  });

  it("aşırı uzun/bozuk gelen başlık kabul edilmez, yenisi üretilir", () => {
    // Başlık istemci kontrolündedir: log satırlarına sınırsız metin veya kontrol
    // karakteri enjekte edilmesini engelle.
    const res = makeRes();
    let inside: string | undefined;

    requestIdMiddleware(
      { headers: { "x-request-id": "x".repeat(200) } } as any,
      res as any,
      () => {
        inside = getRequestId();
      },
    );

    expect(inside).not.toBe("x".repeat(200));
    expect(inside!.length).toBeLessThanOrEqual(64);
  });

  it("bağlam istemcinin IP'sini ve kullanıcı ajanını taşır (onay kanıtı)", () => {
    const res = makeRes();
    let info: ReturnType<typeof getRequestClientInfo> | undefined;

    requestIdMiddleware(
      {
        ip: "172.18.0.4",
        headers: {
          [GATEWAY_CLIENT_IP_HEADER]: "85.105.10.20",
          "user-agent": "Mozilla/5.0",
        },
      } as any,
      res as any,
      () => {
        info = getRequestClientInfo();
      },
    );

    expect(info).toEqual({
      ipAddress: "85.105.10.20",
      userAgent: "Mozilla/5.0",
    });
  });

  it("istek bağlamı dışında (cron/worker) kanıt alanları null'dır", () => {
    expect(getRequestClientInfo()).toEqual({
      ipAddress: null,
      userAgent: null,
    });
  });
});
