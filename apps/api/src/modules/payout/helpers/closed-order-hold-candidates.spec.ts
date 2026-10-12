import { OrderStatus, PaymentHoldStatus, Prisma } from "@prisma/client";
import {
  closedOrderHeldHoldsQuery,
  findClosedOrderHeldHolds,
} from "./closed-order-hold-candidates";

/**
 * Kalıntı yollarının (cron bırakması + platforma kapatma) TEK aday sorgusu:
 * adayı siparişin KAPANMIŞ olmasından seçer, `refundedAmount`'tan değil.
 */
describe("closedOrderHeldHoldsQuery", () => {
  it("joins the order and selects held, unfrozen holds of closed orders — ordered and bounded", () => {
    const query = closedOrderHeldHoldsQuery({ limit: 50 });

    expect(query.sql).toContain("JOIN orders o ON o.id = h.order_id");
    expect(query.sql).toContain("h.frozen_by_refund_id IS NULL");
    expect(query.sql).toContain("ORDER BY h.created_at ASC, h.id ASC");
    expect(query.sql).toContain("LIMIT");
    expect(query.sql).not.toContain("refunded_amount");
    expect(query.values).toEqual([
      PaymentHoldStatus.held,
      OrderStatus.cancelled,
      OrderStatus.refunded,
      50,
    ]);
  });

  it("undatedOnly narrows to holds without a release date", () => {
    expect(closedOrderHeldHoldsQuery({ limit: 1 }).sql).not.toContain(
      "release_at IS NULL",
    );
    expect(
      closedOrderHeldHoldsQuery({ limit: 1, undatedOnly: true }).sql,
    ).toContain("h.release_at IS NULL");
  });

  it("pages with a (createdAt, id) keyset cursor", () => {
    const createdAt = new Date("2026-10-01T09:00:00.000Z");
    const query = closedOrderHeldHoldsQuery({
      limit: 10,
      after: { createdAt, id: "hold-9" },
    });

    expect(query.sql).toContain("(h.created_at, h.id) >");
    expect(query.values).toEqual(
      expect.arrayContaining([createdAt, "hold-9", 10]),
    );
  });

  it("runs the built query on the given client", async () => {
    const rows = [{ id: "h1", createdAt: new Date() }];
    const db = { $queryRaw: jest.fn().mockResolvedValue(rows) };

    await expect(
      findClosedOrderHeldHolds(db as never, { limit: 5 }),
    ).resolves.toBe(rows);
    expect(db.$queryRaw.mock.calls[0][0]).toBeInstanceOf(Prisma.Sql);
  });
});
