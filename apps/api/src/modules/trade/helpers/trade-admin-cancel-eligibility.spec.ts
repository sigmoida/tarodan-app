import { ShipmentStatus, TradeStatus } from "@prisma/client";
import {
  ADMIN_TRADE_CANCELLABLE_STATUSES,
  ADMIN_TRADE_CANCEL_BLOCKERS,
  ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS,
  adminTradeCancelBlocker,
  isAdminCancelNoteRequired,
  isTradeParcelHandedToCarrier,
  type AdminTradeCancelBlocker,
} from "@tarodan/types";
import {
  TRADE_VALID_TRANSITIONS,
  computeTradeCanCancel,
} from "./trade.state-machine";
import { SHIPMENT_IN_MOTION_STATUSES } from "../../shipping/helpers/shipment-handover";
import { translateMessage } from "../../i18n/translate";

/**
 * Admin (platform) takas iptali uygunluğu `@tarodan/types`'ta TEK kaynaktır:
 * API önizleme/iptal kapısı ve admin panelinin düğmesi aynı kuralı okur. Bu
 * spec kuralı Prisma enum'larına ve takasın mevcut iptal kapılarına karşı
 * sabitler.
 */
describe("admin takas iptali uygunluğu", () => {
  const noShipments = { shipments: [] };

  it("her TradeStatus ya iptal edilebilir ya da açık bir engele eşlenir", () => {
    for (const status of Object.values(TradeStatus)) {
      const blocker = adminTradeCancelBlocker({ status, ...noShipments });
      const cancellable = (
        ADMIN_TRADE_CANCELLABLE_STATUSES as readonly string[]
      ).includes(status);
      expect(blocker === null).toBe(cancellable);
      if (blocker) expect(ADMIN_TRADE_CANCEL_BLOCKERS).toContain(blocker);
    }
  });

  it("iptal edilebilir aşamalar tam olarak kullanıcının iptal edebildiği aşamalardır", () => {
    const userCancellable = Object.values(TradeStatus).filter((status) =>
      computeTradeCanCancel(
        { status, initiatorId: "u1", receiverId: "u2" },
        "u1",
      ),
    );
    expect([...ADMIN_TRADE_CANCELLABLE_STATUSES].sort()).toEqual(
      [...userCancellable].sort(),
    );
    // ve durum makinesi her birinden `cancelled`a geçişe izin verir
    for (const status of ADMIN_TRADE_CANCELLABLE_STATUSES) {
      expect(TRADE_VALID_TRANSITIONS[status]).toContain(TradeStatus.cancelled);
    }
  });

  it.each<[TradeStatus, AdminTradeCancelBlocker]>([
    [TradeStatus.completed, "closed"],
    [TradeStatus.cancelled, "closed"],
    [TradeStatus.rejected, "closed"],
    [TradeStatus.disputed, "disputed"],
    [TradeStatus.at_warehouse, "at_warehouse"],
    [TradeStatus.admin_reviewing, "at_warehouse"],
    [TradeStatus.shipping_to_recipients, "shipping_to_recipients"],
    [TradeStatus.returning, "returning"],
    [TradeStatus.initiator_shipped, "legacy_shipped"],
    [TradeStatus.receiver_shipped, "legacy_shipped"],
    [TradeStatus.both_shipped, "legacy_shipped"],
    [TradeStatus.initiator_received, "legacy_shipped"],
    [TradeStatus.receiver_received, "legacy_shipped"],
  ])("%s → %s", (status, expected) => {
    expect(adminTradeCancelBlocker({ status, ...noShipments })).toBe(expected);
  });

  it("tanınmayan statü fail-closed: kapalı sayılır", () => {
    expect(
      adminTradeCancelBlocker({ status: "brand_new_status", ...noShipments }),
    ).toBe("closed");
  });

  it("her engelin katalog anahtarı vardır (iki dilde de)", () => {
    for (const blocker of ADMIN_TRADE_CANCEL_BLOCKERS) {
      const key = ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS[blocker];
      expect(key).toMatch(/^server\.admin\.trade\.cancelBlocked\./);
      // Eksik anahtar çevirmende anahtarın kendisine düşer.
      expect(translateMessage(key, "tr")).not.toBe(key);
      expect(translateMessage(key, "en")).not.toBe(key);
    }
  });

  describe("shipping_to_warehouse — kolinin taşıyıcıya geçişi", () => {
    const shipping = (
      shipments: Array<{
        leg?: string;
        status: ShipmentStatus;
        shippedAt?: Date | null;
        deliveredAt?: Date | null;
      }>,
      extra: { firstWarehouseArrivalAt?: Date | null } = {},
    ) =>
      adminTradeCancelBlocker({
        status: TradeStatus.shipping_to_warehouse,
        shipments,
        ...extra,
      });

    it("yalnız etiket basılmış (pending / label_created) koliler iptale engel değildir", () => {
      expect(
        shipping([
          { leg: "to_warehouse", status: ShipmentStatus.pending },
          { leg: "to_warehouse", status: ShipmentStatus.label_created },
        ]),
      ).toBeNull();
    });

    it("yerelde iptal edilmiş etiket devir sayılmaz", () => {
      expect(
        shipping([{ leg: "to_warehouse", status: ShipmentStatus.cancelled }]),
      ).toBeNull();
    });

    it.each([...SHIPMENT_IN_MOTION_STATUSES])(
      "hareket eden bacak (%s) iptali engeller",
      (status) => {
        expect(shipping([{ leg: "to_warehouse", status }])).toBe(
          "parcel_handed_over",
        );
      },
    );

    it("shippedAt mührü tek başına devirdir (bilinmeyen taşıyıcı kodu)", () => {
      expect(
        shipping([
          {
            leg: "to_warehouse",
            status: ShipmentStatus.label_created,
            shippedAt: new Date(),
          },
        ]),
      ).toBe("parcel_handed_over");
    });

    it("tek tarafın kolisi yolda, diğeri etikette → engel", () => {
      expect(
        shipping([
          { leg: "to_warehouse", status: ShipmentStatus.label_created },
          { leg: "to_warehouse", status: ShipmentStatus.in_transit },
        ]),
      ).toBe("parcel_handed_over");
    });

    it("depoya ilk varış damgası tek başına engeldir", () => {
      expect(shipping([], { firstWarehouseArrivalAt: new Date() })).toBe(
        "parcel_handed_over",
      );
    });

    it("leg verilmeyen satır to_warehouse sayılır (kolon varsayılanı)", () => {
      expect(shipping([{ status: ShipmentStatus.picked_up }])).toBe(
        "parcel_handed_over",
      );
    });

    it("API (Date) ve panel (ISO metin) aynı sonucu verir", () => {
      const iso = new Date().toISOString();
      expect(
        isTradeParcelHandedToCarrier({
          shipments: [
            { leg: "to_warehouse", status: "label_created", shippedAt: iso },
          ],
        }),
      ).toBe(true);
      expect(
        isTradeParcelHandedToCarrier({
          cancelLockedAt: iso,
          shipments: [],
        }),
      ).toBe(true);
    });
  });

  it("'Diğer' gerekçesinde iç not zorunludur, diğerlerinde değil", () => {
    expect(isAdminCancelNoteRequired("other")).toBe(true);
    expect(isAdminCancelNoteRequired("stock_error")).toBe(false);
    expect(isAdminCancelNoteRequired("user_request")).toBe(false);
  });
});
