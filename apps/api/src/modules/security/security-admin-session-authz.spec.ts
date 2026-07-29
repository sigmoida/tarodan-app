import { SecurityService } from "./security.service";

describe("SecurityService admin session ownership", () => {
  it("scopes a session termination to the authenticated admin user", async () => {
    const prisma = {
      adminSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new SecurityService(prisma as any, {} as any);

    await service.terminateAdminSession("session-1", "admin-user-1");

    expect(prisma.adminSession.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        adminUserId: "admin-user-1",
      },
    });
  });
});
