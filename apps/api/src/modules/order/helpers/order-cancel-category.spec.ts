import { OrderStatus } from "@prisma/client";
import { ADMIN_CANCEL_REASON_CODES } from "@tarodan/types";
import { adminCancelReasonText } from "./admin-cancel-reason";
import {
  ORDER_CANCEL_REASON,
  deriveOrderCancelCategory,
} from "./order-cancel-reasons";

const cancelled = (cancelReason?: string | null) => ({
  status: OrderStatus.cancelled,
  cancelReason,
});

/**
 * Müşteri ekranlarının iptal kategorisi. Regresyon: yönetici iptali artık
 * "Yönetici tarafından iptal edildi: <etiket>" yazıyor (admin-cancel-reason.ts);
 * kategori eski "Admin tarafından iptal edildi" metnini bekliyordu ve yeni metin
 * `other` kalıp ham haliyle gösteriliyordu.
 */
describe("deriveOrderCancelCategory", () => {
  it("iptal edilmemiş siparişte null döner", () => {
    expect(
      deriveOrderCancelCategory({
        status: OrderStatus.paid,
        cancelReason: "Yönetici tarafından iptal edildi: x",
      }),
    ).toBeNull();
  });

  it("gerekçesiz iptal alıcının kendi iptalidir", () => {
    expect(deriveOrderCancelCategory(cancelled(null))).toBe("buyer_cancelled");
    expect(deriveOrderCancelCategory(cancelled("  "))).toBe("buyer_cancelled");
  });

  it("süre dolumu gerekçelerini ayırır", () => {
    expect(
      deriveOrderCancelCategory(
        cancelled(ORDER_CANCEL_REASON.paymentWindowExpired),
      ),
    ).toBe("payment_timeout");
    expect(
      deriveOrderCancelCategory(
        cancelled(ORDER_CANCEL_REASON.sellerShipDeadlineExpired),
      ),
    ).toBe("seller_no_ship");
  });

  describe("yönetici iptali", () => {
    it.each(ADMIN_CANCEL_REASON_CODES)(
      "güncel metin (%s) 'admin' kategorisine düşer",
      (code) => {
        expect(
          deriveOrderCancelCategory(cancelled(adminCancelReasonText(code))),
        ).toBe("admin");
      },
    );

    it("önek tek başına da tanınır", () => {
      expect(
        deriveOrderCancelCategory(
          cancelled("Yönetici tarafından iptal edildi"),
        ),
      ).toBe("admin");
    });

    it("etiket 'Stok tüken…' ya da 'takas' geçse de 'admin' kalır", () => {
      expect(
        deriveOrderCancelCategory(
          cancelled("Yönetici tarafından iptal edildi: Stok tükendi"),
        ),
      ).toBe("admin");
      expect(
        deriveOrderCancelCategory(
          cancelled("Yönetici tarafından iptal edildi: takas iptali"),
        ),
      ).toBe("admin");
    });

    it("eski metinler hâlâ tanınır", () => {
      expect(
        deriveOrderCancelCategory(cancelled("Admin tarafından iptal edildi")),
      ).toBe("admin");
      expect(
        deriveOrderCancelCategory(cancelled("Admin force-cancel: spam")),
      ).toBe("admin");
    });

    it("öneki yalnız andıran metin 'admin' sayılmaz", () => {
      expect(
        deriveOrderCancelCategory(
          cancelled("Yönetici tarafından iptal edildiği için"),
        ),
      ).toBe("other");
    });
  });

  it("alıcı lehine admin kararı ayrı kategoridir", () => {
    expect(
      deriveOrderCancelCategory(cancelled("Alıcı lehine iptal edildi")),
    ).toBe("admin_buyer_favor");
  });

  it("stok, takas ve toplu değişim gerekçelerini ayırır", () => {
    expect(
      deriveOrderCancelCategory(cancelled(ORDER_CANCEL_REASON.stockDepleted)),
    ).toBe("stockout");
    expect(
      deriveOrderCancelCategory(
        cancelled(ORDER_CANCEL_REASON.stockReservedForTrade),
      ),
    ).toBe("trade_reserved");
    expect(
      deriveOrderCancelCategory(
        cancelled(ORDER_CANCEL_REASON.replacedByNewCheckout),
      ),
    ).toBe("bulk_replaced");
  });

  it("tanınmayan serbest metin 'other' kalır", () => {
    expect(deriveOrderCancelCategory(cancelled("Başka bir neden"))).toBe(
      "other",
    );
  });
});
