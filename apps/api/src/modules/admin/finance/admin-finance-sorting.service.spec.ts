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

  it("sorts payments by displayed order and buyer aliases", async () => {
    const payment = createDelegate();
    const service = new AdminPaymentService(
      { payment } as any,
      {} as any,
      {} as any,
    );

    await service.getPayments({ sortBy: "orderNumber", sortOrder: "asc" });
    await service.getPayments({
      sortBy: "buyer.displayName",
      sortOrder: "desc",
    });

    expect(payment.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: { order: { orderNumber: "asc" } },
      }),
    );
    expect(payment.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: { order: { buyer: { displayName: "desc" } } },
      }),
    );
  });

  it("searches payments across displayed relations and status", async () => {
    const payment = createDelegate();
    const prisma = {
      payment,
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const service = new AdminPaymentService(
      prisma as any,
      {} as any,
      {} as any,
    );

    await service.getPayments({ search: "completed" });

    expect(payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { status: "completed" },
            {
              order: {
                OR: expect.arrayContaining([
                  {
                    buyer: {
                      displayName: {
                        contains: "completed",
                        mode: "insensitive",
                      },
                    },
                  },
                ]),
              },
            },
          ]),
        }),
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

  it("sorts eLogo invoices by the displayed PDF availability", async () => {
    const elogoInvoice = createDelegate();
    elogoInvoice.findMany.mockResolvedValue([
      { id: "missing", pdfUrl: null },
      { id: "ready", pdfUrl: "invoice.pdf" },
    ]);
    const service = new AdminTaxService(
      { elogoInvoice } as any,
      {} as any,
      {} as any,
    );

    const result = await service.getElogoInvoices({
      sortBy: "hasPdf",
      sortOrder: "desc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["ready", "missing"]);
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
      {} as any, // payoutCore — bu spec'in konusu değil
      {} as any, // scheduledQueue
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
      {} as any, // payoutCore — bu spec'in konusu değil
      {} as any, // scheduledQueue
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

  it("searches and paginates the payout schedule with displayed aliases", async () => {
    const paymentHold = createDelegate();
    // Grup ödemesinde sipariş numarası hold.orderId üzerinden aranır/çözülür —
    // servis artık order delegate'ini de kullanır.
    const order = { findMany: jest.fn().mockResolvedValue([]) };
    const service = new AdminPayoutService(
      { paymentHold, order } as any,
      {} as any,
      {} as any,
      {} as any, // payoutCore — bu spec'in konusu değil
      {} as any, // scheduledQueue
    );

    await service.getPayoutsSchedule({
      search: "ali",
      sortBy: "sellerName",
      sortOrder: "asc",
    });

    expect(paymentHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              seller: {
                displayName: { contains: "ali", mode: "insensitive" },
              },
            },
          ]),
        }),
        orderBy: { seller: { displayName: "asc" } },
        skip: 0,
        take: 20,
      }),
    );
  });
});
