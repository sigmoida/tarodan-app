import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { ROLES_KEY } from "../../auth/decorators/roles.decorator";
import { AdminPaymentController } from "./admin-payment.controller";
import { AdminPayoutService } from "./admin-payout.service";

const URL = "/api/admin/payouts/holds/hold-1/settle-residual";

/**
 * `POST /admin/payouts/holds/:id/settle-residual` — satıcı kusurlu kalıntıyı
 * platforma kapatır. Gerçek Reflector + RolesGuard ile controller metadata'sı
 * üzerinden sınanır: super_admin ve admin (`payouts` izniyle), moderator asla.
 */
describe("settle-residual endpoint — guard", () => {
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

  const context = (role: AdminRole): ExecutionContext =>
    ({
      getHandler: () => AdminPaymentController.prototype.settleHoldResidual,
      getClass: () => AdminPaymentController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method: "POST",
          originalUrl: URL,
        }),
      }),
    }) as unknown as ExecutionContext;

  it("is limited to super_admin and admin", () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminPaymentController.prototype.settleHoldResidual,
      ),
    ).toEqual([AdminRole.super_admin, AdminRole.admin]);
  });

  it("moderator is rejected by role", async () => {
    await expect(
      guard().canActivate(context(AdminRole.moderator)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("admin passes with the default matrix (payouts permission)", async () => {
    await expect(guard().canActivate(context(AdminRole.admin))).resolves.toBe(
      true,
    );
  });

  it("admin without the payouts permission is rejected", async () => {
    await expect(
      guard({ admin: ["payments"] }).canActivate(context(AdminRole.admin)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("super_admin passes", async () => {
    await expect(
      guard().canActivate(context(AdminRole.super_admin)),
    ).resolves.toBe(true);
  });
});

describe("AdminPayoutService.settleHoldResidual", () => {
  const makeService = () => {
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue({ id: "audit-1" }),
    };
    const settled = {
      holdId: "hold-1",
      orderId: "order-1",
      sellerId: "seller-1",
      settledAmount: 40,
      faultBasis: "seller" as const,
    };
    const tx = { marker: "tx" };
    const holdResidual = {
      settleResidual: jest.fn(
        async (
          _holdId: string,
          opts: {
            afterWrite?: (
              tx: unknown,
              result: typeof settled,
            ) => Promise<unknown>;
          },
        ) => {
          await opts.afterWrite?.(tx, settled);
          return settled;
        },
      ),
    };
    const service = new AdminPayoutService(
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      holdResidual as never,
    );
    return { service, audit, holdResidual, settled, tx };
  };

  it("settles through the domain service and writes the required audit in the same transaction", async () => {
    const { service, audit, holdResidual, settled, tx } = makeService();

    const result = await service.settleHoldResidual(
      "admin-1",
      "hold-1",
      "  satıcı kusurlu iptal  ",
    );

    expect(result).toEqual({ success: true, ...settled });
    expect(holdResidual.settleResidual).toHaveBeenCalledWith("hold-1", {
      actor: "admin-1",
      reason: "satıcı kusurlu iptal",
      afterWrite: expect.any(Function),
    });
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "payout_hold_residual_settle",
      "PaymentHold",
      "hold-1",
      { action: "settle_residual", reason: "satıcı kusurlu iptal" },
      {
        settledAmount: 40,
        orderId: "order-1",
        sellerId: "seller-1",
        faultBasis: "seller",
      },
      tx,
    );
  });

  it.each(["", "   "])("requires a reason (%j)", async (reason) => {
    const { service, holdResidual } = makeService();

    await expect(
      service.settleHoldResidual("admin-1", "hold-1", reason),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(holdResidual.settleResidual).not.toHaveBeenCalled();
  });

  it("propagates the domain 409 untouched", async () => {
    const { service, holdResidual, audit } = makeService();
    const conflict = new Error("not settleable");
    holdResidual.settleResidual.mockRejectedValueOnce(conflict);

    await expect(
      service.settleHoldResidual("admin-1", "hold-1", "x"),
    ).rejects.toBe(conflict);
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });
});
