import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { mapTrades, tradeCancelNote } from "./trades";
import { tradeFilterFields } from "./filters";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as unknown as T;

const row = (raw: Record<string, unknown>) =>
  mapTrades(
    [
      {
        id: "t1",
        tradeNumber: "TKS-1",
        status: "cancelled",
        createdAt: "2026-10-05T12:00:00.000Z",
        ...raw,
      },
    ],
    t,
  )[0];

describe("takas listesi iptal notu", () => {
  it("platform iptali: kod etiketinden, ham (varsayılan dildeki) metinden değil", () => {
    expect(
      tradeCancelNote(
        row({
          cancelledBy: "platform",
          adminCancelReasonCode: "suspicious_activity",
          cancelReason: "Tarodan tarafından iptal edildi: Şüpheli işlem",
        }),
        t,
      ),
    ).toBe(
      "admin.operations.trades.adminCancel.cancelledByPlatform · adminCancel.reasons.suspicious_activity",
    );
  });

  it("diğer iptaller eski kısa etiketi korur", () => {
    expect(
      tradeCancelNote(
        row({ cancelReason: "Süre dolumu nedeniyle otomatik iptal" }),
        t,
      ),
    ).toBe("admin.shared.cancelReason.deadlineExpired");
  });

  it("iptal edilmemiş satırda not yok", () => {
    expect(
      tradeCancelNote(
        row({
          status: "completed",
          cancelledBy: "platform",
          adminCancelReasonCode: "other",
        }),
        t,
      ),
    ).toBeNull();
  });
});

describe("takas filtreleri", () => {
  it("platform iptal nedeni filtresi API'nin sorgu adını kullanır ve 'Tümü' ile başlar", () => {
    const field = tradeFilterFields(t).find(
      (f) => f.type === "select" && f.name === "adminCancelReasonCode",
    );
    expect(field).toBeDefined();
    expect(field?.type === "select" && field.options[0]?.value).toBe("all");
  });
});
