import { ServiceUnavailableException } from "@nestjs/common";
import { i18nMessage } from "../../i18n/localized-message";
import { NetsisRequestException } from "../../netsis";
import { NetsisAccountingMappingError } from "./netsis-accounting-mapper";
import { netsisSyncFailureOutcome } from "./netsis-sync-failure-policy";

const preSend = (code: string) =>
  new NetsisRequestException(
    "network",
    null,
    "POST: TypeError",
    undefined,
    Object.assign(new TypeError("fetch failed"), { cause: { code } }),
  );

describe("netsisSyncFailureOutcome", () => {
  it("eşleme (ayar) hatası bütçeyi hemen bitirir", () => {
    const error = new NetsisAccountingMappingError(
      "server.netsis.accounting.error.retailCariMissing",
    );
    expect(netsisSyncFailureOutcome(error, "prepare")).toBe("exhaust");
  });

  it.each(["prepare", "send"] as const)(
    "%s: oturum kilidi / kapalı entegrasyon / bağlantı kurulamadı → bütçe tüketmez",
    (phase) => {
      expect(
        netsisSyncFailureOutcome(
          new ServiceUnavailableException(i18nMessage("server.netsis.sessionBusy")),
          phase,
        ),
      ).toBe("retry");
      expect(
        netsisSyncFailureOutcome(
          new ServiceUnavailableException(i18nMessage("server.netsis.disabled")),
          phase,
        ),
      ).toBe("retry");
      expect(netsisSyncFailureOutcome(preSend("ECONNREFUSED"), phase)).toBe(
        "retry",
      );
    },
  );

  describe("prepare (henüz yazma yok)", () => {
    it("ağ → yeniden; kimlik/yapılandırma → bitir; diğerleri → bir deneme", () => {
      expect(netsisSyncFailureOutcome(preSend("ETIMEDOUT"), "prepare")).toBe(
        "retry",
      );
      expect(
        netsisSyncFailureOutcome(
          new NetsisRequestException("auth", 401, "x"),
          "prepare",
        ),
      ).toBe("exhaust");
      expect(netsisSyncFailureOutcome(new Error("slip yok"), "prepare")).toBe(
        "attempt",
      );
    });
  });

  describe("send (yazma çağrısı)", () => {
    it("Netsis yanıt verip reddettiyse kayıt oluşmamıştır", () => {
      expect(
        netsisSyncFailureOutcome(
          new NetsisRequestException("validation", 400, "TUTAR"),
          "send",
        ),
      ).toBe("attempt");
      expect(
        netsisSyncFailureOutcome(
          new NetsisRequestException("auth", 401, "x"),
          "send",
        ),
      ).toBe("exhaust");
    });

    it("zaman aşımı, kopma, 5xx, 'zaten var' ve tanınmayan hata: sonuç BİLİNMİYOR", () => {
      expect(netsisSyncFailureOutcome(preSend("ETIMEDOUT"), "send")).toBe(
        "unknown",
      );
      expect(netsisSyncFailureOutcome(preSend("ECONNRESET"), "send")).toBe(
        "unknown",
      );
      expect(
        netsisSyncFailureOutcome(
          new NetsisRequestException("unknown", 500, "x"),
          "send",
        ),
      ).toBe("unknown");
      expect(
        netsisSyncFailureOutcome(
          new NetsisRequestException("conflict", 409, "zaten var"),
          "send",
        ),
      ).toBe("unknown");
      expect(netsisSyncFailureOutcome(new Error("shape"), "send")).toBe(
        "unknown",
      );
    });

    it("eksik bağlantı adresi yapılandırma hatasıdır (istek atılmadı)", () => {
      expect(
        netsisSyncFailureOutcome(
          new NetsisRequestException(
            "configuration",
            null,
            "NETSIS_BASE_URL is not set",
            "server.netsis.notConfigured",
          ),
          "send",
        ),
      ).toBe("exhaust");
    });
  });
});
