import { OrderStatus } from "@prisma/client";
import {
  lockOrderPaymentRows,
  lockOrdersStillPayable,
  lockPaymentOrders,
} from "./payment-order-lock";

/**
 * Çekim claim'i ve ödeme callback'i siparişleri kilitleyerek okur; ödenmemiş
 * siparişi kapatan yollar (admin iptali, 24s süpürmesi, alıcı iptali) satırı
 * yazdığı için ikisi sıralanır. Burada sabitlenen: hangi satırlar, hangi
 * kilit, "ödenebilir" kararı.
 */
describe("payment-order-lock", () => {
  /** Tagged-template çağrısının SQL metni (parametreler `?`). */
  const sqlOf = (call: unknown[]) =>
    (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ").trim();

  const txWith = (rows: { status: string }[]) => ({
    $queryRaw: jest.fn().mockResolvedValue(rows),
  });

  describe("lockOrdersStillPayable (claim)", () => {
    it("tekil sipariş: satırı FOR SHARE kilitler; pending_payment ise ödenebilir", async () => {
      const tx = txWith([{ status: OrderStatus.pending_payment }]);

      await expect(
        lockOrdersStillPayable(tx as any, {
          orderId: "o1",
          checkoutGroupId: null,
        }),
      ).resolves.toBe(true);
      const call = tx.$queryRaw.mock.calls[0];
      expect(sqlOf(call)).toBe(
        "SELECT status::text AS status FROM orders WHERE id = ? FOR SHARE",
      );
      expect(call[1]).toBe("o1");
    });

    it.each([OrderStatus.cancelled, OrderStatus.preparing, OrderStatus.paid])(
      "kilit altında %s okunursa ödenemez (araya iptal/ödeme girdi)",
      async (status) => {
        const tx = txWith([{ status }]);
        await expect(
          lockOrdersStillPayable(tx as any, {
            orderId: "o1",
            checkoutGroupId: null,
          }),
        ).resolves.toBe(false);
      },
    );

    it("sepet: bütün siparişleri id sırasıyla kilitler; biri iptalse sepet ödenemez", async () => {
      const tx = txWith([
        { status: OrderStatus.pending_payment },
        { status: OrderStatus.cancelled },
      ]);

      await expect(
        lockOrdersStillPayable(tx as any, {
          orderId: null,
          checkoutGroupId: "g1",
        }),
      ).resolves.toBe(false);
      const call = tx.$queryRaw.mock.calls[0];
      expect(sqlOf(call)).toBe(
        "SELECT status::text AS status FROM orders WHERE checkout_group_id = ? ORDER BY id FOR SHARE",
      );
      expect(call[1]).toBe("g1");
    });

    it("sipariş satırı bulunamazsa ödenemez", async () => {
      const tx = txWith([]);
      await expect(
        lockOrdersStillPayable(tx as any, {
          orderId: "missing",
          checkoutGroupId: null,
        }),
      ).resolves.toBe(false);
    });

    it("siparişi olmayan hedef (takas nakit) kilitsiz ödenebilir", async () => {
      const tx = txWith([]);
      await expect(
        lockOrdersStillPayable(tx as any, {
          orderId: null,
          checkoutGroupId: null,
        }),
      ).resolves.toBe(true);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("lockOrderPaymentRows (24s süpürmesi)", () => {
    it("siparişin kendi ve sepetinin ödeme satırlarını id sırasıyla FOR UPDATE kilitler", async () => {
      const tx = txWith([]);
      await lockOrderPaymentRows(tx as any, "o1");
      const call = tx.$queryRaw.mock.calls[0];
      expect(sqlOf(call)).toBe(
        "SELECT p.id FROM payments p WHERE p.order_id = ? OR p.checkout_group_id = ( SELECT o.checkout_group_id FROM orders o WHERE o.id = ? ) ORDER BY p.id FOR UPDATE OF p",
      );
      expect(call.slice(1)).toEqual(["o1", "o1"]);
    });
  });

  describe("lockPaymentOrders (callback)", () => {
    it("tekil sipariş ve sepet satırlarını FOR UPDATE kilitler", async () => {
      const single = txWith([]);
      await lockPaymentOrders(single as any, {
        orderId: "o1",
        checkoutGroupId: null,
      });
      expect(sqlOf(single.$queryRaw.mock.calls[0])).toBe(
        "SELECT id FROM orders WHERE id = ? FOR UPDATE",
      );

      const group = txWith([]);
      await lockPaymentOrders(group as any, {
        orderId: null,
        checkoutGroupId: "g1",
      });
      expect(sqlOf(group.$queryRaw.mock.calls[0])).toBe(
        "SELECT id FROM orders WHERE checkout_group_id = ? ORDER BY id FOR UPDATE",
      );
    });

    it("siparişsiz hedefte kilit yoktur", async () => {
      const tx = txWith([]);
      await lockPaymentOrders(tx as any, {
        orderId: null,
        checkoutGroupId: null,
      });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
