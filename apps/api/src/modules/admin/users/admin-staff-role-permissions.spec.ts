import { AdminStaffService } from "./admin-staff.service";

/**
 * Saving the role matrix on the Roles page always gives super admin every
 * key, so a newly added key (e.g. `seller_trust_lab`) can never be unticked
 * for super admin by a stale form (AC-A5 of the seller trust lab plan).
 */
describe("AdminStaffService.setRolePermissions", () => {
  const build = () => {
    const prisma = {
      adminUser: { findFirst: jest.fn().mockResolvedValue({ id: "adm-1" }) },
      platformSetting: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new AdminStaffService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  };

  it("keeps the seller trust lab key for super admin whatever the form sent", async () => {
    const { service, prisma } = build();
    const saved = await service.setRolePermissions("user-1", {
      permissions: { super_admin: [], admin: ["users"], moderator: [] },
    });
    expect(saved.super_admin).toContain("seller_trust_lab");
    expect(saved.admin).toEqual(["users"]);
    const stored = JSON.parse(
      prisma.platformSetting.upsert.mock.calls[0][0].update.settingValue,
    ) as Record<string, string[]>;
    expect(stored.super_admin).toContain("seller_trust_lab");
  });
});
