import { AdminUserService } from "../users/admin-user.service";

/**
 * Admin iptali kullanıcı iptaliyle AYNI sözleşmeyi taşımalı: autoRenew da
 * kapanır. Açık kalsaydı runAutoRenewals dönem sonunda kartı çekip admin
 * iptalini sessizce geri alırdı.
 */
describe("AdminUserService.adminCancelUserMembership", () => {
  const makeService = (membership: Record<string, unknown>) => {
    const prisma = {
      userMembership: {
        findUnique: jest.fn().mockResolvedValue(membership),
        update: jest.fn().mockResolvedValue({
          id: "mem-1",
          tier: { type: "premium" },
        }),
      },
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminUserService(
      prisma as any,
      audit as any,
      undefined as any,
    );
    return { service, prisma, audit };
  };

  it("iptalde autoRenew de kapatılır (kullanıcı iptaliyle parite)", async () => {
    const { service, prisma } = makeService({
      id: "mem-1",
      status: "active",
      tier: { type: "premium" },
    });

    await service.adminCancelUserMembership("admin-1", "user-1");

    expect(prisma.userMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          status: "cancelled",
          cancelledAt: expect.any(Date),
          autoRenew: false,
        }),
      }),
    );
  });

  it("free üyelik iptal edilemez", async () => {
    const { service, prisma } = makeService({
      id: "mem-1",
      status: "active",
      tier: { type: "free" },
    });

    await expect(
      service.adminCancelUserMembership("admin-1", "user-1"),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.membership.freeTierCannotCancel" },
    });
    expect(prisma.userMembership.update).not.toHaveBeenCalled();
  });
});
