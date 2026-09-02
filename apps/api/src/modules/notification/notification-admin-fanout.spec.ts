import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationType } from "./dto";

describe("NotificationDispatchService.notifyAllAdmins", () => {
  const prisma = { adminUser: { findMany: jest.fn() } };
  let service: NotificationDispatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationDispatchService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any,
    );
  });

  it("delivers to every active admin and counts successes", async () => {
    prisma.adminUser.findMany.mockResolvedValue([
      { userId: "a1" },
      { userId: "a2" },
      { userId: "a3" },
    ]);
    const spy = jest
      .spyOn(service, "createInAppNotification")
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("pref load failed"))
      .mockResolvedValueOnce(false);

    const delivered = await service.notifyAllAdmins(
      NotificationType.USER_BLOCKED_ADMIN,
      { blockerId: "u1" },
    );

    expect(prisma.adminUser.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { userId: true },
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(delivered).toBe(1);
  });

  it("never throws when the admin lookup fails", async () => {
    prisma.adminUser.findMany.mockRejectedValue(new Error("db down"));
    await expect(
      service.notifyAllAdmins(NotificationType.USER_REPORTED_ADMIN, {}),
    ).resolves.toBe(0);
  });
});
