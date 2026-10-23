import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole, PayoutStatus } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { ROLES_KEY } from "../../auth/decorators/roles.decorator";
import {
  MarkPayoutTransferPaidDto,
  RetryPayoutTransferDto,
} from "../dto/payout.dto";
import { AdminPaymentController } from "./admin-payment.controller";
import {
  AdminPayoutService,
  type TransferWithRelations,
} from "./admin-payout.service";

/**
 * Admin surfaces of the payout manual resolution (H2, docs/PAYMENTS.md §6):
 * `POST /admin/payouts/transfers/:id/mark-paid`, the retry guard on
 * `POST /admin/payouts/:transferId/retry` and the transfer list flags the
 * panel reads. The money rules themselves are pinned in
 * `payout/resolution/payout-resolution.service.spec.ts`.
 */

type Handler = (...args: never[]) => unknown;

const guard = (permissions?: Record<string, string[]>) =>
  new RolesGuard(new Reflector(), {
    platformSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          permissions ? { settingValue: JSON.stringify(permissions) } : null,
        ),
    },
  } as never);

const context = (
  handler: Handler,
  url: string,
  role: AdminRole,
): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => AdminPaymentController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { isAdmin: true, role },
        method: "POST",
        originalUrl: url,
      }),
    }),
  }) as unknown as ExecutionContext;

describe("mark-paid endpoint — access", () => {
  const handler = AdminPaymentController.prototype.markPayoutTransferPaid;
  const url = "/api/admin/payouts/transfers/t-1/mark-paid";

  it("is limited to super_admin and admin", () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      AdminRole.super_admin,
      AdminRole.admin,
    ]);
  });

  it("moderator is rejected by role, even with the payouts permission", async () => {
    await expect(
      guard({ moderator: ["payouts"] }).canActivate(
        context(handler, url, AdminRole.moderator),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("admin without the payouts permission is rejected", async () => {
    await expect(
      guard({ admin: ["payments"] }).canActivate(
        context(handler, url, AdminRole.admin),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("admin with the default matrix (payouts) and super_admin pass", async () => {
    await expect(
      guard().canActivate(context(handler, url, AdminRole.admin)),
    ).resolves.toBe(true);
    await expect(
      guard().canActivate(context(handler, url, AdminRole.super_admin)),
    ).resolves.toBe(true);
  });
});

describe("retry endpoint — access is unchanged", () => {
  const handler = AdminPaymentController.prototype.retryPayoutTransfer;
  const url = "/api/admin/payouts/t-1/retry";

  it("keeps super_admin, admin and moderator by role", () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      AdminRole.super_admin,
      AdminRole.admin,
      AdminRole.moderator,
    ]);
  });

  it("still needs the payouts permission (moderator has none by default)", async () => {
    await expect(
      guard().canActivate(context(handler, url, AdminRole.moderator)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard({ moderator: ["payouts"] }).canActivate(
        context(handler, url, AdminRole.moderator),
      ),
    ).resolves.toBe(true);
  });
});

async function invalidFields<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain));
  return errors.map((e) => e.property).sort();
}

describe("request bodies", () => {
  const valid = {
    method: "external_bank",
    reference: "EFT-20261023-001",
    reason: "Residual paid from the company account",
    expectedNetAmount: 40,
  };

  it("mark-paid accepts both methods with reference, reason and the net", async () => {
    await expect(
      invalidFields(MarkPayoutTransferPaidDto, valid),
    ).resolves.toEqual([]);
    await expect(
      invalidFields(MarkPayoutTransferPaidDto, {
        ...valid,
        method: "paytr_confirmed",
        expectedNetAmount: 300.5,
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    [{ method: "cash" }, ["method"]],
    [{ method: undefined }, ["method"]],
    [{ reference: "" }, ["reference"]],
    [{ reference: "x".repeat(121) }, ["reference"]],
    [{ reason: "" }, ["reason"]],
    [{ reason: "x".repeat(501) }, ["reason"]],
    [{ expectedNetAmount: 0 }, ["expectedNetAmount"]],
    [{ expectedNetAmount: -5 }, ["expectedNetAmount"]],
    [{ expectedNetAmount: 40.001 }, ["expectedNetAmount"]],
    [{ expectedNetAmount: "40" }, ["expectedNetAmount"]],
    [{ expectedNetAmount: undefined }, ["expectedNetAmount"]],
  ])("mark-paid rejects %j", async (over, fields) => {
    await expect(
      invalidFields(MarkPayoutTransferPaidDto, { ...valid, ...over }),
    ).resolves.toEqual(fields);
  });

  it("retry accepts an empty body (old admin panel) and the confirmation", async () => {
    await expect(invalidFields(RetryPayoutTransferDto, {})).resolves.toEqual(
      [],
    );
    await expect(
      invalidFields(RetryPayoutTransferDto, {
        confirmProviderChecked: true,
        reason: "PayTR panel shows no transfer",
      }),
    ).resolves.toEqual([]);
    await expect(
      invalidFields(RetryPayoutTransferDto, { confirmProviderChecked: "yes" }),
    ).resolves.toEqual(["confirmProviderChecked"]);
  });
});

describe("AdminPayoutService — delegation and audit", () => {
  const tx = { marker: "tx" };
  const previous = {
    status: PayoutStatus.failed,
    failureReason: "transfer_needs_manual_decision",
    transId: "PYTP1",
    netAmount: 40,
    submittedAmount: null,
    submittedTotalAmount: null,
    providerReference: "OLDREF",
    providerResponse: { transferTotal: { net: 40 } },
  };
  const settled = {
    transferId: "t-1",
    transId: "PYTP1",
    sellerId: "seller-1",
    orderId: "order-1",
    tradeId: null,
    method: "external_bank" as const,
    reference: "EFT-1",
    netAmount: 40,
    platformFundedAmount: 40,
    settledAt: "2026-10-23T10:00:00.000Z",
    alreadySettled: false,
  };

  const makeService = () => {
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue({ id: "audit-1" }),
    };
    const resolution = {
      markPaid: jest.fn(
        async (
          _id: string,
          opts: {
            afterWrite?: (
              t: unknown,
              r: unknown,
              p: unknown,
            ) => Promise<unknown>;
          },
        ) => {
          await opts.afterWrite?.(tx, settled, previous);
          return settled;
        },
      ),
      retry: jest.fn(
        async (
          _id: string,
          opts: {
            afterWrite?: (
              t: unknown,
              r: unknown,
              p: unknown,
            ) => Promise<unknown>;
          },
        ) => {
          const result = {
            transferId: "t-1",
            transId: "PYTNEW",
            renewedTransId: true,
            providerCheckConfirmed: true,
            previous,
          };
          await opts.afterWrite?.(tx, result, previous);
          return result;
        },
      ),
    };
    const service = new AdminPayoutService(
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      resolution as never,
    );
    return { service, audit, resolution };
  };

  it("mark-paid: trims the reason, passes the request to the domain and audits in its transaction", async () => {
    const { service, audit, resolution } = makeService();

    const result = await service.markPayoutTransferPaid("admin-1", "t-1", {
      method: "external_bank",
      reference: "EFT-1",
      reason: "  paid from the company account  ",
      expectedNetAmount: 40,
    });

    expect(result).toEqual({ success: true, ...settled });
    expect(resolution.markPaid).toHaveBeenCalledWith("t-1", {
      actor: "admin-1",
      method: "external_bank",
      reference: "EFT-1",
      expectedNetAmount: 40,
      afterWrite: expect.any(Function),
    });
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "payout_mark_paid",
      "PayoutTransfer",
      "t-1",
      expect.objectContaining({
        status: PayoutStatus.failed,
        failureReason: "transfer_needs_manual_decision",
        transId: "PYTP1",
        netAmount: 40,
      }),
      expect.objectContaining({
        status: "completed",
        method: "external_bank",
        reference: "EFT-1",
        reason: "paid from the company account",
        netAmount: 40,
        platformFundedAmount: 40,
        orderId: "order-1",
      }),
      tx,
    );
  });

  it.each(["", "   "])(
    "mark-paid requires a reason (%j) before touching anything",
    async (reason) => {
      const { service, resolution } = makeService();

      await expect(
        service.markPayoutTransferPaid("admin-1", "t-1", {
          method: "external_bank",
          reference: "EFT-1",
          reason,
          expectedNetAmount: 40,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(resolution.markPaid).not.toHaveBeenCalled();
    },
  );

  it("retry: passes the confirmation and audits the previous PayTR reference and answer in its transaction", async () => {
    const { service, audit, resolution } = makeService();

    const result = await service.retryPayoutTransfer("admin-1", "t-1", {
      confirmProviderChecked: true,
      reason: "  PayTR panel: nothing sent  ",
    });

    expect(result).toEqual(
      expect.objectContaining({ success: true, transferId: "t-1" }),
    );
    expect(resolution.retry).toHaveBeenCalledWith("t-1", {
      actor: "admin-1",
      confirmProviderChecked: true,
      reason: "PayTR panel: nothing sent",
      afterWrite: expect.any(Function),
    });
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "payout_retry",
      "PayoutTransfer",
      "t-1",
      expect.objectContaining({
        action: "admin_retry",
        transId: "PYTP1",
        providerReference: "OLDREF",
        providerResponse: { transferTotal: { net: 40 } },
        failureReason: "transfer_needs_manual_decision",
        providerCheckConfirmed: true,
        reason: "PayTR panel: nothing sent",
      }),
      { status: "pending", transId: "PYTNEW" },
      tx,
    );
  });

  it("retry without a body still works for the old admin panel", async () => {
    const { service, resolution } = makeService();

    await service.retryPayoutTransfer("admin-1", "t-1");

    expect(resolution.retry).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({
        confirmProviderChecked: undefined,
        reason: undefined,
      }),
    );
  });
});

describe("AdminPayoutService.toTransferRows — resolution flags", () => {
  const service = new AdminPayoutService(
    {
      order: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "order-1", orderNumber: "ORD-1" }]),
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const transfer = (over: Partial<TransferWithRelations>) =>
    ({
      id: "t-1",
      paymentHoldId: "hold-1",
      paymentHold: { orderId: "order-1" },
      tradeCashPaymentId: null,
      seller: { id: "seller-1", displayName: "Seller", email: "s@x.test" },
      sellerId: "seller-1",
      amount: 322,
      netAmount: 40,
      adjustmentDeduction: 0,
      transferIban: "TR330006100519786457841326",
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      providerResponse: {
        transferTotal: {
          net: 40,
          allowedTotal: 0,
          ownAllowed: 0,
          oidRemaining: 0,
          sourceTotal: 322,
        },
      },
      submittedAmount: null,
      submittedTotalAmount: null,
      retryCount: 1,
      processedAt: null,
      createdAt: new Date("2026-10-20T10:00:00.000Z"),
      ...over,
    }) as unknown as TransferWithRelations;

  it("a parked residual offers external_bank with the net and shows the total snapshot", async () => {
    const [row] = await service.toTransferRows([transfer({})]);

    expect(row).toMatchObject({
      orderNumber: "ORD-1",
      ibanLast4: "1326",
      submittedTotalAmount: null,
      transferTotal: {
        net: 40,
        allowedTotal: 0,
        ownAllowed: 0,
        oidRemaining: 0,
        missingInput: null,
      },
      resolution: {
        retryRequiresProviderCheck: false,
        markPaidMethod: "external_bank",
        markPaidNetAmount: 40,
      },
      manualSettlement: null,
    });
  });

  it("an unknown outcome asks for the panel check and offers paytr_confirmed", async () => {
    const [row] = await service.toTransferRows([
      transfer({
        failureReason: "transfer_outcome_unknown",
        submittedAmount: 300 as never,
        submittedTotalAmount: 303 as never,
        netAmount: 300 as never,
        providerResponse: { error: { phase: "unknown" } },
      }),
    ]);

    expect(row).toMatchObject({
      submittedTotalAmount: 303,
      transferTotal: null,
      resolution: {
        retryRequiresProviderCheck: true,
        markPaidMethod: "paytr_confirmed",
        markPaidNetAmount: 300,
      },
    });
  });

  it("a resent row does not show an earlier settlement", async () => {
    const [row] = await service.toTransferRows([
      transfer({
        status: PayoutStatus.pending,
        failureReason: null,
        providerResponse: {
          manualSettlement: { method: "paytr_confirmed", reference: "P1" },
        },
      }),
    ]);

    expect(row.manualSettlement).toBeNull();
  });

  it("a row marked as paid shows the settlement without the admin id", async () => {
    const [row] = await service.toTransferRows([
      transfer({
        status: PayoutStatus.completed,
        failureReason: null,
        submittedTotalAmount: 0 as never,
        providerResponse: {
          manualSettlement: {
            method: "external_bank",
            reference: "EFT-1",
            adminId: "admin-1",
            settledAt: "2026-10-23T10:00:00.000Z",
            netAmount: 40,
            platformFundedAmount: 40,
          },
        },
      }),
    ]);

    expect(row.resolution).toEqual({
      retryRequiresProviderCheck: false,
      markPaidMethod: null,
      markPaidNetAmount: null,
    });
    expect(row.manualSettlement).toEqual({
      method: "external_bank",
      reference: "EFT-1",
      settledAt: "2026-10-23T10:00:00.000Z",
      netAmount: 40,
      platformFundedAmount: 40,
    });
    expect(row.submittedTotalAmount).toBe(0);
  });
});
