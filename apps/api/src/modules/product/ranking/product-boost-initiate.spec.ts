import {
  OrderOrigin,
  OrderStatus,
  ProductKind,
  ProductStatus,
} from "@prisma/client";
import { PaymentProvider } from "../../payment/dto";
import { BoostAudienceService } from "../boost-seller/boost-audience.service";
import { ProductBoostService } from "./product-boost.service";

/**
 * Behaviour pin of the boost purchase start (money): the consent gate, the
 * one transaction that writes the boost, its virtual product, its order and
 * the two consents, the amounts, and what happens when a step fails.
 */
describe("ProductBoostService.initiateBoost — consent and transaction", () => {
  const OWNER = "seller-1";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const tier = (over: Record<string, unknown> = {}) => ({
    price: 150,
    campaignPrice: null,
    campaignStartsAt: null,
    campaignEndsAt: null,
    ...over,
  });

  /** The `data` of the first call of a Prisma write mock. */
  const firstData = (mock: jest.Mock): Record<string, unknown> => {
    const [arg] = (mock.mock.calls[0] ?? []) as unknown[];
    return (arg as { data: Record<string, unknown> }).data;
  };

  function harness(opts: { tier?: Record<string, unknown> } = {}) {
    const calls: string[] = [];
    const track =
      <T>(name: string, value: T) =>
      (..._args: unknown[]) => {
        calls.push(name);
        return Promise.resolve(value);
      };

    // Writes of the purchase go through `tx` only: the root client has none
    // of them, so a write outside the transaction fails the test.
    const tx = {
      productBoost: {
        create: jest.fn(track("tx.productBoost.create", { id: "b1" })),
        update: jest.fn(track("tx.productBoost.update", {})),
      },
      product: { create: jest.fn(track("tx.product.create", {})) },
      order: {
        create: jest.fn(
          track("tx.order.create", { id: "order-1", orderNumber: "BST-1" }),
        ),
      },
    };
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "listing-1",
          sellerId: OWNER,
          status: ProductStatus.active,
          title: "Model car",
          categoryId: "cat-1",
          price: 1500,
          oldPrice: null,
        }),
      },
      userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
      adPackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pkg-1",
          name: "Ekonomik",
          showcaseOnHome: false,
        }),
      },
      adPackageTier: {
        findFirst: jest.fn().mockResolvedValue(tier(opts.tier)),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "platform" }) },
      category: { findFirst: jest.fn().mockResolvedValue({ id: "cat-1" }) },
      order: { count: jest.fn().mockResolvedValue(0) },
      // Only the cleanup after a failed payment start writes outside `tx`.
      productBoost: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => {
        calls.push("$transaction:start");
        const result = await fn(tx);
        calls.push("$transaction:commit");
        return result;
      }),
    };
    const consents = {
      recordForOrder: jest.fn(track("consents.recordForOrder", undefined)),
    };
    const payment = {
      initiatePayment: jest.fn(
        track("payment.initiatePayment", {
          paymentId: "pay-1",
          provider: "paytr",
          expiresIn: 300,
        }),
      ),
    };
    const sentry = { setTag: jest.fn(), addBreadcrumb: jest.fn() };
    const service = new ProductBoostService(
      prisma as never,
      payment as never,
      consents as never,
      new BoostAudienceService(prisma as never),
      sentry as never,
    );
    return { service, prisma, tx, consents, payment, sentry, calls };
  }

  const input = (over: Record<string, unknown> = {}) => ({
    packageId: "pkg-1",
    durationDays: 7,
    provider: PaymentProvider.paytr,
    autoRenew: false,
    preInformationAccepted: true,
    withdrawalWaiverAccepted: true,
    ...over,
  });

  describe("consent gate", () => {
    it.each([
      [{ preInformationAccepted: false }],
      [{ withdrawalWaiverAccepted: false }],
      [{ preInformationAccepted: undefined }],
      [{ withdrawalWaiverAccepted: undefined }],
      [
        {
          preInformationAccepted: undefined,
          withdrawalWaiverAccepted: undefined,
        },
      ],
    ])(
      "refuses %p with 400 boostConsentRequired before any read or write",
      async (over) => {
        const h = harness();

        await expect(
          h.service.initiateBoost(OWNER, "listing-1", input(over)),
        ).rejects.toMatchObject({
          status: 400,
          response: { i18nKey: "server.product.boostConsentRequired" },
        });
        expect(h.prisma.platformSetting.findUnique).not.toHaveBeenCalled();
        expect(h.prisma.product.findFirst).not.toHaveBeenCalled();
        expect(h.prisma.$transaction).not.toHaveBeenCalled();
        expect(h.consents.recordForOrder).not.toHaveBeenCalled();
        expect(h.payment.initiatePayment).not.toHaveBeenCalled();
      },
    );

    it.each(["true", 1, "yes", null])(
      "refuses a non-boolean %p from a caller that skipped the DTO",
      async (value) => {
        // The DTO already turns these into a 400; the service rule is still
        // `=== true`, so no other caller can pass evidence that is not a
        // real JSON true.
        const h = harness();

        await expect(
          h.service.initiateBoost(
            OWNER,
            "listing-1",
            input({
              preInformationAccepted: value,
              withdrawalWaiverAccepted: value,
            }) as never,
          ),
        ).rejects.toMatchObject({
          status: 400,
          response: { i18nKey: "server.product.boostConsentRequired" },
        });
        expect(h.prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it("answers a stranger without consents with the consent 400, not the ownership 403", async () => {
      // Checked first: the refusal tells nothing about whose listing it is or
      // whether boost sales are on.
      const h = harness();
      h.prisma.product.findFirst.mockResolvedValue({
        id: "listing-1",
        sellerId: "someone-else",
        status: ProductStatus.inactive,
      });
      h.prisma.platformSetting.findUnique.mockResolvedValue({
        settingValue: "false",
      });

      await expect(
        h.service.initiateBoost(
          "stranger",
          "listing-1",
          input({ preInformationAccepted: false }),
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "server.product.boostConsentRequired" },
      });
    });
  });

  describe("with both consents", () => {
    it("writes boost, virtual product, order and consents in one transaction, then starts the payment", async () => {
      const h = harness();

      await h.service.initiateBoost(OWNER, "listing-1", input());

      expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(h.calls).toEqual([
        "$transaction:start",
        "tx.productBoost.create",
        "tx.product.create",
        "tx.order.create",
        "tx.productBoost.update",
        "consents.recordForOrder",
        "$transaction:commit",
        // The payment intent comes only after the commit.
        "payment.initiatePayment",
      ]);
      expect(h.consents.recordForOrder).toHaveBeenCalledWith(h.tx, {
        orderId: "order-1",
        userId: OWNER,
      });
      expect(h.payment.initiatePayment).toHaveBeenCalledWith(
        OWNER,
        { orderId: "order-1", provider: PaymentProvider.paytr },
        undefined,
      );
    });

    it("pins the boost, the virtual product and the order amounts", async () => {
      const h = harness();
      const before = Date.now();

      const result = await h.service.initiateBoost(OWNER, "listing-1", input());

      expect(h.tx.productBoost.create).toHaveBeenCalledWith({
        data: {
          productId: "listing-1",
          userId: OWNER,
          packageId: "pkg-1",
          packageName: "Ekonomik",
          showcaseOnHome: false,
          durationDays: 7,
          price: 150,
          status: "pending",
          autoRenew: false,
        },
      });
      expect(h.tx.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "boost-b1",
          sellerId: "platform",
          price: 150,
          kind: ProductKind.boost,
          status: ProductStatus.active,
        }),
      });
      const orderData = firstData(h.tx.order.create);
      expect(orderData).toMatchObject({
        buyerId: OWNER,
        sellerId: "platform",
        productId: "boost-b1",
        origin: OrderOrigin.platform_service,
        totalAmount: 150,
        commissionAmount: 0,
        shippingCost: 0,
        status: OrderStatus.pending_payment,
        shippingAddress: { type: "boost", boostId: "b1" },
      });
      expect(orderData.orderNumber).toMatch(/^BST-/);
      const expiresIn = (orderData.paymentExpiresAt as Date).getTime() - before;
      expect(expiresIn).toBeGreaterThanOrEqual(DAY_MS - 1000);
      expect(expiresIn).toBeLessThanOrEqual(DAY_MS + 1000);
      expect(h.tx.productBoost.update).toHaveBeenCalledWith({
        where: { id: "b1" },
        data: { orderId: "order-1" },
      });
      expect(result).toEqual({
        boostId: "b1",
        productId: "listing-1",
        durationDays: 7,
        price: 150,
        paymentId: "pay-1",
        provider: "paytr",
        expiresIn: 300,
        useBypass: false,
      });
    });

    it("charges the campaign price while its window is open", async () => {
      const h = harness({
        tier: {
          price: 150,
          campaignPrice: 99,
          campaignStartsAt: new Date(Date.now() - DAY_MS),
          campaignEndsAt: new Date(Date.now() + DAY_MS),
        },
      });

      const result = await h.service.initiateBoost(OWNER, "listing-1", input());

      expect(firstData(h.tx.order.create).totalAmount).toBe(99);
      expect(firstData(h.tx.productBoost.create).price).toBe(99);
      expect(result.price).toBe(99);
    });
  });

  describe("traceability", () => {
    it("tags flow=boost and leaves the boost and order ids in Sentry, no personal data", async () => {
      const h = harness();

      await h.service.initiateBoost(OWNER, "listing-1", input());

      expect(h.sentry.setTag).toHaveBeenCalledWith("flow", "boost");
      const crumbs = h.sentry.addBreadcrumb.mock.calls.map(
        ([crumb]: [{ message: string; data: unknown }]) => crumb,
      );
      expect(crumbs).toEqual([
        expect.objectContaining({
          message: "boost.initiate",
          data: { productId: "listing-1" },
        }),
        expect.objectContaining({
          message: "boost.order_created",
          data: {
            boostId: "b1",
            orderId: "order-1",
            orderNumber: "BST-1",
            productId: "listing-1",
          },
        }),
      ]);
    });

    it("tags even a refused request", async () => {
      const h = harness();

      await expect(
        h.service.initiateBoost(
          OWNER,
          "listing-1",
          input({ withdrawalWaiverAccepted: false }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(h.sentry.setTag).toHaveBeenCalledWith("flow", "boost");
    });
  });

  describe("partial failure", () => {
    it("rolls everything back when the consents cannot be written: no payment, no cleanup", async () => {
      const h = harness();
      h.consents.recordForOrder.mockRejectedValueOnce(new Error("db down"));
      h.prisma.$transaction.mockImplementationOnce(
        async (fn: (client: typeof h.tx) => unknown) => fn(h.tx),
      );

      await expect(
        h.service.initiateBoost(OWNER, "listing-1", input()),
      ).rejects.toThrow("db down");
      expect(h.payment.initiatePayment).not.toHaveBeenCalled();
      // The transaction rolled the boost back: nothing to mark failed.
      expect(h.prisma.productBoost.update).not.toHaveBeenCalled();
    });

    it.each([
      ["the boost", "productBoost", "create"],
      ["the virtual product", "product", "create"],
      // A unique order number taken between the check and the write.
      ["the order", "order", "create"],
      ["the order link", "productBoost", "update"],
    ] as const)(
      "commits nothing and starts no payment when writing %s fails",
      async (_label, model, method) => {
        const h = harness();
        const failure = new Error(`${model}.${method} failed`);
        (h.tx[model] as Record<string, jest.Mock>)[
          method
        ].mockRejectedValueOnce(failure);

        await expect(
          h.service.initiateBoost(OWNER, "listing-1", input()),
        ).rejects.toBe(failure);
        expect(h.calls).not.toContain("$transaction:commit");
        // No consent row is written for an order that is not there.
        expect(h.consents.recordForOrder).not.toHaveBeenCalled();
        expect(h.payment.initiatePayment).not.toHaveBeenCalled();
        // Nothing committed, so nothing to mark failed outside the transaction.
        expect(h.prisma.productBoost.update).not.toHaveBeenCalled();
        const crumbs = h.sentry.addBreadcrumb.mock.calls.map(
          ([crumb]: [{ message: string }]) => crumb.message,
        );
        expect(crumbs).not.toContain("boost.order_created");
      },
    );

    it("marks the committed boost failed when the payment cannot start, and rethrows", async () => {
      const h = harness();
      const failure = new Error("payment start failed");
      h.payment.initiatePayment.mockRejectedValueOnce(failure);

      await expect(
        h.service.initiateBoost(OWNER, "listing-1", input()),
      ).rejects.toBe(failure);
      expect(h.prisma.productBoost.update).toHaveBeenCalledWith({
        where: { id: "b1" },
        data: { status: "failed" },
      });
    });

    it("keeps the original error when the cleanup fails too", async () => {
      const h = harness();
      const failure = new Error("payment start failed");
      h.payment.initiatePayment.mockRejectedValueOnce(failure);
      h.prisma.productBoost.update.mockRejectedValueOnce(new Error("cleanup"));

      await expect(
        h.service.initiateBoost(OWNER, "listing-1", input()),
      ).rejects.toBe(failure);
    });
  });
});
