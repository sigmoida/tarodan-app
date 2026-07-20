/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminPaymentService } from "./admin-payment.service";
import { AdminPayoutService } from "./admin-payout.service";
import { AdminTaxService } from "./admin-tax.service";

function createDelegate() {
  return {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  };
}

describe("admin finance list sorting", () => {
  it("sorts payments by amount and paginates", async () => {
    const payment = createDelegate();
    const service = new AdminPaymentService(
      { payment } as any,
      {} as any,
      {} as any,
    );

    await service.getPayments({
      page: 2,
      limit: 5,
      sortBy: "amount",
      sortOrder: "asc",
    });

    expect(payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { amount: "asc" },
        skip: 5,
        take: 5,
      }),
    );
  });

  it("sorts failed payments through the shared payment query", async () => {
    const payment = createDelegate();
    const service = new AdminPaymentService(
      { payment } as any,
      {} as any,
      {} as any,
    );

    await service.getFailedPayments({
      sortBy: "provider",
      sortOrder: "desc",
    });

    expect(payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "failed" },
        orderBy: { provider: "desc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("sorts eLogo invoices by total", async () => {
    const elogoInvoice = createDelegate();
    const service = new AdminTaxService(
      { elogoInvoice } as any,
      {} as any,
      {} as any,
    );

    await service.getElogoInvoices({ sortBy: "total", sortOrder: "asc" });

    expect(elogoInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { total: "asc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("sorts seller invoices and preserves their uploaded-at default", async () => {
    const sellerUploadedInvoice = createDelegate();
    const service = new AdminTaxService(
      { sellerUploadedInvoice } as any,
      {} as any,
      {} as any,
    );

    await service.getSellerUploadedInvoices({});

    expect(sellerUploadedInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { uploadedAt: "desc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("sorts seller invoices by the displayed company-name fallback", async () => {
    const sellerUploadedInvoice = createDelegate();
    const service = new AdminTaxService(
      { sellerUploadedInvoice } as any,
      {} as any,
      {} as any,
    );

    await service.getSellerUploadedInvoices({
      sortBy: "sellerName",
      sortOrder: "asc",
    });

    expect(sellerUploadedInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          {
            order: {
              seller: {
                companyName: { sort: "asc", nulls: "last" },
              },
            },
          },
          { order: { seller: { displayName: "asc" } } },
        ],
      }),
    );
  });

  it("sorts payout transactions by release date", async () => {
    const paymentHold = createDelegate();
    const service = new AdminPayoutService(
      {
        paymentHold,
        order: { findMany: jest.fn().mockResolvedValue([]) },
      } as any,
      {} as any,
      {} as any,
    );

    await service.getPayoutsTransactions({
      sortBy: "releaseAt",
      sortOrder: "asc",
    });

    expect(paymentHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { releaseAt: "asc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("sorts payout transactions by the displayed order number", async () => {
    const paymentHold = createDelegate();
    const service = new AdminPayoutService(
      {
        paymentHold,
        order: { findMany: jest.fn().mockResolvedValue([]) },
      } as any,
      {} as any,
      {} as any,
    );

    await service.getPayoutsTransactions({
      sortBy: "orderNumber",
      sortOrder: "desc",
    });

    expect(paymentHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          payment: { order: { orderNumber: "desc" } },
        },
      }),
    );
  });
});
