import { Prisma } from "@prisma/client";
import { AdminRefundService } from "./admin-refund.service";
import { refundComponentTotals } from "../../refund/helpers/refund-component-totals";

/**
 * `GET /admin/refund-requests/:id` taraf başına toplamları da döner — panel
 * bileşen satırlarını kendisi toplamaz.
 */
describe("AdminRefundService.getRefundRequestDetail — financialTotals", () => {
  it("adds per-side totals computed from the persisted components", async () => {
    const financialComponents = [
      {
        componentCode: "product",
        treatment: "buyer_refund",
        grossAmount: new Prisma.Decimal("500.00"),
      },
      {
        componentCode: "outbound_shipping",
        treatment: "buyer_refund",
        grossAmount: new Prisma.Decimal("36.00"),
      },
      {
        componentCode: "outbound_shipping",
        treatment: "seller_charge",
        grossAmount: new Prisma.Decimal("72.00"),
      },
      {
        componentCode: "seller_platform_fee",
        treatment: "platform_retain",
        grossAmount: new Prisma.Decimal("18.00"),
      },
    ];
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: "rr-1",
          financialComponents,
          order: { product: null },
        }),
      },
    };
    const service = new AdminRefundService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined as never,
    );

    const detail = await service.getRefundRequestDetail("rr-1");

    expect(detail.financialComponents).toBe(financialComponents);
    expect(detail.financialTotals).toEqual(
      refundComponentTotals(financialComponents),
    );
    expect(detail.financialTotals).toMatchObject({
      buyerNet: 536,
      sellerNet: -72,
      platformNet: 18,
      shippingRefund: 36,
    });
  });
});
