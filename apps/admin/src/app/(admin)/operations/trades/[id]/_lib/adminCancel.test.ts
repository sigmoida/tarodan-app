import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { ADMIN_CANCEL_NOTE_MAX } from "@tarodan/types";
import type { TradeDetail, TradeShipment } from "../types";
import { tradeCancelBlocker, tradeCancelPanelState } from "./adminCancel";
import { NO_ADMIN_CANCEL_REASON, adminCancelTradeSchema } from "./schema";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as unknown as T;

const trade = (overrides: Partial<TradeDetail> = {}) =>
  ({
    id: "t1",
    tradeNumber: "TKS-1",
    status: "shipping_to_warehouse",
    initiator: { id: "u1", displayName: "Ayşe", email: "a@x" },
    receiver: { id: "u2", displayName: "Can", email: "c@x" },
    initiatorItems: [],
    receiverItems: [],
    shipments: [],
    createdAt: "2026-10-05T12:00:00.000Z",
    ...overrides,
  }) as TradeDetail;

const leg = (overrides: Partial<TradeShipment> = {}): TradeShipment => ({
  id: "s1",
  leg: "to_warehouse",
  status: "label_created",
  shippedAt: null,
  deliveredAt: null,
  ...overrides,
});

describe("tradeCancelBlocker — panelin ortak kural girdisi", () => {
  it.each(["pending", "accepted", "awaiting_payment", "shipping_to_warehouse"])(
    "%s, hiçbir koli devredilmemiş → uygun",
    (status) => {
      expect(tradeCancelBlocker(trade({ status }))).toBeNull();
    },
  );

  it("yalnız etiket basılmış bacaklar uygunluğu bozmaz", () => {
    expect(
      tradeCancelBlocker(
        trade({ shipments: [leg(), leg({ id: "s2", status: "pending" })] }),
      ),
    ).toBeNull();
  });

  it("panel ISO metin taşır: shippedAt mührü devirdir", () => {
    expect(
      tradeCancelBlocker(
        trade({ shipments: [leg({ shippedAt: "2026-10-05T10:00:00.000Z" })] }),
      ),
    ).toBe("parcel_handed_over");
  });

  it("hareket eden bacak devirdir", () => {
    expect(
      tradeCancelBlocker(trade({ shipments: [leg({ status: "in_transit" })] })),
    ).toBe("parcel_handed_over");
  });

  it("depoya ilk varış devirdir", () => {
    expect(
      tradeCancelBlocker(
        trade({ firstWarehouseArrivalAt: "2026-10-05T10:00:00.000Z" }),
      ),
    ).toBe("parcel_handed_over");
  });

  it("durumu bilinmeyen bacak (status yok) devir sayılmaz", () => {
    expect(
      tradeCancelBlocker(trade({ shipments: [leg({ status: undefined })] })),
    ).toBeNull();
  });
});

describe("tradeCancelPanelState", () => {
  it("uygun → düğme", () => {
    expect(tradeCancelPanelState(trade())).toEqual({ kind: "allowed" });
  });

  it("depoda → engel metni (depo reddine yönlendirir)", () => {
    expect(tradeCancelPanelState(trade({ status: "at_warehouse" }))).toEqual({
      kind: "blocked",
      messageKey: "server.admin.trade.cancelBlocked.atWarehouse",
    });
  });

  it("koli yolda → engel metni", () => {
    expect(
      tradeCancelPanelState(
        trade({ shipments: [leg({ status: "picked_up" })] }),
      ),
    ).toEqual({
      kind: "blocked",
      messageKey: "server.admin.trade.cancelBlocked.parcelHandedOver",
    });
  });

  it.each(["completed", "cancelled", "rejected"])(
    "%s (kapanmış) → hiçbir şey gösterilmez",
    (status) => {
      expect(tradeCancelPanelState(trade({ status }))).toEqual({
        kind: "hidden",
      });
    },
  );
});

describe("adminCancelTradeSchema", () => {
  const schema = adminCancelTradeSchema(t);

  it("neden seçilmeden gönderilemez", () => {
    const result = schema.safeParse({ reasonCode: "", note: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["reasonCode"]);
  });

  it("katalog dışı kod reddedilir", () => {
    expect(schema.safeParse({ reasonCode: "nope", note: "" }).success).toBe(
      false,
    );
  });

  it("katalog kodu + boş not geçerlidir; çıktı yalnız katalog kodunu taşır", () => {
    const result = schema.safeParse({ reasonCode: "stock_error", note: "" });
    expect(result.success).toBe(true);
    expect(result.data?.reasonCode).toBe("stock_error");
  });

  it("form 'seçilmedi' hâliyle açılır ve öyle gönderilemez", () => {
    expect(NO_ADMIN_CANCEL_REASON).toBe("");
    expect(
      schema.safeParse({ reasonCode: NO_ADMIN_CANCEL_REASON, note: "x" })
        .success,
    ).toBe(false);
  });

  it("'Diğer'de boş ya da yalnız boşluk not reddedilir", () => {
    for (const note of ["", "   "]) {
      const result = schema.safeParse({ reasonCode: "other", note });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["note"]);
      expect(result.error?.issues[0]?.message).toBe(
        "admin.operations.trades.adminCancel.noteRequired",
      );
    }
  });

  it("'Diğer' + not geçerlidir", () => {
    expect(
      schema.safeParse({ reasonCode: "other", note: "Mükerrer hesap" }).success,
    ).toBe(true);
  });

  it("not üst sınırı API ile aynıdır", () => {
    expect(
      schema.safeParse({
        reasonCode: "other",
        note: "x".repeat(ADMIN_CANCEL_NOTE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});
