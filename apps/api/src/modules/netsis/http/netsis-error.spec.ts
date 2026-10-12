import { HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { i18nMessage } from "../../i18n/localized-message";
import {
  classifyNetsisError,
  classifyNetsisResponse,
  describeNetsisError,
  isNetsisPreSendFailure,
  NetsisRequestException,
  netsisSnippet,
} from "./netsis-error";

describe("describeNetsisError", () => {
  it("Netsis hatası: sınıf + yanıt parçası", () => {
    expect(
      describeNetsisError(
        new NetsisRequestException("validation", 400, "CARI_KOD yok"),
      ),
    ).toBe("validation: CARI_KOD yok");
  });

  it("yerelleştirilmiş hata: katalog metni (tr)", () => {
    expect(
      describeNetsisError(
        new ServiceUnavailableException(i18nMessage("server.netsis.disabled")),
      ),
    ).toBe("Netsis entegrasyonu kapalı");
  });

  it("diğerleri: mesaj, 500 karakterde kesilir", () => {
    expect(describeNetsisError(new Error("x".repeat(600)))).toHaveLength(500);
  });
});

describe("isNetsisPreSendFailure", () => {
  const wrapped = (code: string) =>
    new NetsisRequestException(
      "network",
      null,
      "POST MixedReceiptsMain: TypeError",
      undefined,
      Object.assign(new TypeError("fetch failed"), { cause: { code } }),
    );

  it("bağlantı hiç kurulamadıysa istek Netsis'e ulaşmamıştır", () => {
    expect(isNetsisPreSendFailure(wrapped("ECONNREFUSED"))).toBe(true);
    expect(isNetsisPreSendFailure(wrapped("ENOTFOUND"))).toBe(true);
    expect(isNetsisPreSendFailure(wrapped("UND_ERR_CONNECT_TIMEOUT"))).toBe(
      true,
    );
  });

  it("zaman aşımı, kopma ve sunucu yanıtı belirsizdir (false)", () => {
    expect(isNetsisPreSendFailure(wrapped("ETIMEDOUT"))).toBe(false);
    expect(isNetsisPreSendFailure(wrapped("ECONNRESET"))).toBe(false);
    expect(
      isNetsisPreSendFailure(new NetsisRequestException("network", 504, "x")),
    ).toBe(false);
    expect(isNetsisPreSendFailure(new Error("boom"))).toBe(false);
  });
});

describe("classifyNetsisError", () => {
  const upstream = (status: number, body = "") => ({ status, body });

  describe("upstream responses", () => {
    it.each([
      [401, "", "auth"],
      [403, "Forbidden", "auth"],
      [400, '{"error":"invalid_grant"}', "auth"],
      [400, "Kullanıcı adı veya şifre hatalı", "auth"],
      [409, "", "conflict"],
      [400, "Duplicate number TRD2026000000001", "conflict"],
      [400, "Bu belge numarası zaten kullanılmış", "conflict"],
      [422, "Mükerrer kayıt", "conflict"],
      [400, "Violation of PRIMARY KEY constraint 'PK_TBLFATUIRS'", "conflict"],
      [400, "Cari kodu boş olamaz", "validation"],
      [422, "", "validation"],
      [404, "", "configuration"],
      [405, "", "configuration"],
      [408, "", "network"],
      [429, "", "network"],
      [502, "", "network"],
      [503, "", "network"],
      [504, "", "network"],
      [500, "Object reference not set", "unknown"],
    ])("HTTP %i %p → %s", (status, body, expected) => {
      expect(classifyNetsisError(upstream(status, body))).toBe(expected);
      expect(classifyNetsisResponse(status, body)).toBe(expected);
    });

    it("treats a failed 200 envelope like a client-side rejection", () => {
      expect(classifyNetsisResponse(200, "FATIRS_NO zaten var")).toBe(
        "conflict",
      );
      expect(classifyNetsisResponse(200, "Stok kodu bulunamadı")).toBe(
        "validation",
      );
    });

    it("does not let a duplicate-looking 5xx body become a conflict", () => {
      // 5xx'te çakışma deseni aranmaz: sunucu hatası "zaten" içerse bile
      // kaydın oluştuğunu kanıtlamaz.
      expect(classifyNetsisResponse(500, "duplicate")).toBe("unknown");
    });
  });

  describe("transport failures", () => {
    const withCode = (code: string, cause = false) => {
      const inner = Object.assign(new Error(code), { code });
      return cause
        ? Object.assign(new TypeError("fetch failed"), { cause: inner })
        : inner;
    };

    it.each([
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
    ])("%s → network", (code) => {
      expect(classifyNetsisError(withCode(code))).toBe("network");
      expect(classifyNetsisError(withCode(code, true))).toBe("network");
    });

    it("classifies an aborted (timed-out) fetch as network", () => {
      const abort = new Error("This operation was aborted");
      abort.name = "AbortError";
      expect(classifyNetsisError(abort)).toBe("network");
    });

    it("classifies a bare undici 'fetch failed' as network", () => {
      expect(classifyNetsisError(new TypeError("fetch failed"))).toBe(
        "network",
      );
    });

    it("classifies certificate problems as configuration (retrying cannot help)", () => {
      expect(
        classifyNetsisError(withCode("DEPTH_ZERO_SELF_SIGNED_CERT", true)),
      ).toBe("configuration");
      expect(classifyNetsisError(withCode("CERT_HAS_EXPIRED"))).toBe(
        "configuration",
      );
    });

    it("falls back to unknown", () => {
      expect(classifyNetsisError(new Error("boom"))).toBe("unknown");
      expect(classifyNetsisError("boom")).toBe("unknown");
      expect(classifyNetsisError(null)).toBe("unknown");
    });
  });

  it("returns the kind of an already classified exception", () => {
    expect(
      classifyNetsisError(new NetsisRequestException("conflict", 409, "dup")),
    ).toBe("conflict");
  });
});

describe("NetsisRequestException", () => {
  it("carries a catalog key per kind, never upstream text", () => {
    const error = new NetsisRequestException("validation", 400, "raw detail");
    expect(error.getResponse()).toEqual({
      i18nKey: "server.netsis.error.validation",
    });
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(error.detail).toBe("raw detail");
    expect(error.upstreamStatus).toBe(400);
  });

  it("maps network failures to 503 so callers can treat them as transient", () => {
    expect(new NetsisRequestException("network", null, "").getStatus()).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it("accepts a more specific catalog key", () => {
    const error = new NetsisRequestException(
      "configuration",
      null,
      "missing settings",
      "server.netsis.notConfigured",
    );
    expect(error.kind).toBe("configuration");
    expect(error.getResponse()).toEqual({
      i18nKey: "server.netsis.notConfigured",
    });
  });
});

describe("netsisSnippet", () => {
  it("flattens and truncates", () => {
    expect(netsisSnippet(" a\r\nb\t c ")).toBe("a b c");
    expect(netsisSnippet("x".repeat(500))).toHaveLength(300);
  });
});
