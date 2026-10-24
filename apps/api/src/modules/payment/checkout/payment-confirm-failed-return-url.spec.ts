import { ForbiddenException } from "@nestjs/common";
import { CancellationActor, PaymentStatus } from "@prisma/client";
import { chargeLikelyLive } from "../helpers/live-charge";
import {
  PaymentLifecycleService,
  type PaymentAccessContext,
} from "./payment-lifecycle.service";

/**
 * `confirm-failed` once the PayTR fail URL carries the payment.
 *
 * The fail URL used to be bare, so the web fail page never called
 * `confirm-failed`. It now carries `paymentId` (and `type`, `guest=true`) for
 * every direct-form target, so the page calls it for every member, guest,
 * cart, boost, membership and trade payment that is still `pending`. These
 * tests pin that the call stays harmless: it never fails a payment whose 3DS
 * charge may still be live (the real `lastChargeStartedAt` stamp of the
 * claim, not a mocked verdict), whatever the attempt the page belongs to, and
 * only the payment's owner (or the guest capability) reaches it.
 */
describe("confirmFailedFromClient — reached from the PayTR fail URL", () => {
  const NOW = new Date("2026-10-21T12:00:00.000Z");
  const MINUTE = 60 * 1000;
  /** `paymentFailTimeoutMinutes` with no admin value and no env: 35. */
  const WINDOW_MIN = 35;

  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  const minutesAgo = (minutes: number) =>
    new Date(NOW.getTime() - minutes * MINUTE).toISOString();

  type Target = {
    order: { id: string; buyerId: string } | null;
    checkoutGroup: { buyerId: string | null } | null;
    tradeCashPayment: { payerId: string } | null;
  };

  /** Each direct-form target, with the access its fail page call has. */
  const TARGETS: Array<[string, Target, PaymentAccessContext]> = [
    [
      "a member's order",
      {
        order: { id: "order-1", buyerId: "buyer-1" },
        checkoutGroup: null,
        tradeCashPayment: null,
      },
      { userId: "buyer-1", capabilityAuthorized: false },
    ],
    [
      "a guest order (payment capability cookie)",
      {
        order: { id: "order-1", buyerId: "system-guest" },
        checkoutGroup: null,
        tradeCashPayment: null,
      },
      { userId: null, capabilityAuthorized: true },
    ],
    [
      "a member's cart",
      {
        order: null,
        checkoutGroup: { buyerId: "buyer-1" },
        tradeCashPayment: null,
      },
      { userId: "buyer-1", capabilityAuthorized: false },
    ],
    [
      "a guest cart (payment capability cookie)",
      {
        order: null,
        checkoutGroup: { buyerId: null },
        tradeCashPayment: null,
      },
      { userId: null, capabilityAuthorized: true },
    ],
    [
      "a boost order",
      {
        order: { id: "order-1", buyerId: "seller-1" },
        checkoutGroup: null,
        tradeCashPayment: null,
      },
      { userId: "seller-1", capabilityAuthorized: false },
    ],
    [
      "a trade cash payment",
      {
        order: null,
        checkoutGroup: null,
        tradeCashPayment: { payerId: "payer-1" },
      },
      { userId: "payer-1", capabilityAuthorized: false },
    ],
  ];

  function make(
    target: Target,
    payment: { status?: PaymentStatus; metadata?: unknown } = {},
  ) {
    const row = {
      id: "pay-1",
      status: payment.status ?? PaymentStatus.pending,
      metadata: payment.metadata ?? null,
      orderId: target.order?.id ?? null,
      ...target,
    };
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(row) },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const processFailedPayment = jest.fn().mockResolvedValue(undefined);
    const service = new PaymentLifecycleService(
      prisma as never,
      { get: jest.fn(() => undefined) } as never,
      {} as never,
      {} as never,
      // The real live-charge rule, so the stamp itself decides.
      { isChargeLikelyLive: chargeLikelyLive } as never,
      { processFailedPayment } as never,
    );
    return { service, prisma, processFailedPayment, row };
  }

  describe.each(TARGETS)("%s", (_label, target, access) => {
    it("does nothing right after a failed 3DS: the claim's charge is still live", async () => {
      // PayTR sends the browser to the fail URL seconds after the claim.
      const { service, processFailedPayment } = make(target, {
        metadata: { lastChargeStartedAt: minutesAgo(0.1) },
      });

      await expect(
        service.confirmFailedFromClient("pay-1", access),
      ).resolves.toEqual({ released: false });
      expect(processFailedPayment).not.toHaveBeenCalled();
    });

    it("does nothing until the fail window has fully passed", async () => {
      const { service, processFailedPayment } = make(target, {
        metadata: { lastChargeStartedAt: minutesAgo(WINDOW_MIN - 1 / 60) },
      });

      await expect(
        service.confirmFailedFromClient("pay-1", access),
      ).resolves.toEqual({ released: false });
      expect(processFailedPayment).not.toHaveBeenCalled();
    });

    it("fails the payment as the system once the window has passed", async () => {
      const { service, processFailedPayment, row } = make(target, {
        metadata: { lastChargeStartedAt: minutesAgo(WINDOW_MIN + 1) },
      });

      await expect(
        service.confirmFailedFromClient("pay-1", access),
      ).resolves.toEqual({ released: true });
      // The same path as PayTR's own failure callback.
      expect(processFailedPayment).toHaveBeenCalledTimes(1);
      expect(processFailedPayment).toHaveBeenCalledWith(
        row,
        expect.any(String),
        CancellationActor.system,
      );
    });

    it.each([
      PaymentStatus.processing,
      PaymentStatus.completed,
      PaymentStatus.failed,
      PaymentStatus.refunded,
    ])("leaves a %s payment alone, however old its charge", async (status) => {
      const { service, processFailedPayment } = make(target, {
        status,
        metadata: { lastChargeStartedAt: minutesAgo(WINDOW_MIN * 10) },
      });

      await expect(
        service.confirmFailedFromClient("pay-1", access),
      ).resolves.toEqual({ released: false });
      expect(processFailedPayment).not.toHaveBeenCalled();
    });
  });

  it("an older attempt's fail page does not fail the newer attempt that is live", async () => {
    // Attempt 1 failed and the buyer retried on the same payment: the claim
    // of attempt 2 rotated the merchant_oid and stamped a fresh charge. The
    // fail page of attempt 1 (opened late, or reloaded) carries the same
    // paymentId, so it must see attempt 2's stamp.
    const { service, processFailedPayment } = make(TARGETS[0][1], {
      metadata: {
        merchantOidHistory: ["ORD10001A1", "ORD10001A2"],
        lastChargeStartedAt: minutesAgo(1),
      },
    });

    await expect(
      service.confirmFailedFromClient("pay-1", TARGETS[0][2]),
    ).resolves.toEqual({ released: false });
    expect(processFailedPayment).not.toHaveBeenCalled();
  });

  it("an admin fail window longer than the default keeps a charge live", async () => {
    const { service, prisma, processFailedPayment } = make(TARGETS[0][1], {
      metadata: { lastChargeStartedAt: minutesAgo(WINDOW_MIN + 5) },
    });
    prisma.platformSetting.findUnique.mockResolvedValue({ settingValue: "60" });

    await expect(
      service.confirmFailedFromClient("pay-1", TARGETS[0][2]),
    ).resolves.toEqual({ released: false });
    expect(processFailedPayment).not.toHaveBeenCalled();
  });

  describe("who may call it", () => {
    const stale = { lastChargeStartedAt: minutesAgo(WINDOW_MIN + 1) };

    it.each([
      [
        "another member, on a member's order",
        TARGETS[0][1],
        { userId: "stranger", capabilityAuthorized: false },
      ],
      [
        "an anonymous caller without the capability, on a guest order",
        TARGETS[1][1],
        { userId: null, capabilityAuthorized: false },
      ],
      [
        "an anonymous caller without the capability, on a guest cart",
        TARGETS[3][1],
        { userId: null, capabilityAuthorized: false },
      ],
      [
        "another member, on a boost order",
        TARGETS[4][1],
        { userId: "buyer-1", capabilityAuthorized: false },
      ],
    ] as Array<[string, Target, PaymentAccessContext]>)(
      "refuses %s and fails nothing",
      async (_label, target, access) => {
        const { service, processFailedPayment } = make(target, {
          metadata: stale,
        });

        const call = service.confirmFailedFromClient("pay-1", access);
        await expect(call).rejects.toBeInstanceOf(ForbiddenException);
        await expect(call).rejects.toMatchObject({
          response: { i18nKey: "server.payment.viewStatusForbidden" },
        });
        expect(processFailedPayment).not.toHaveBeenCalled();
      },
    );

    it("answers an unknown payment id without failing anything", async () => {
      const { service, prisma, processFailedPayment } = make(TARGETS[0][1]);
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmFailedFromClient("pay-x", {
          userId: null,
          capabilityAuthorized: false,
        }),
      ).resolves.toEqual({ released: false });
      expect(processFailedPayment).not.toHaveBeenCalled();
    });
  });
});
