import { BadRequestException } from "@nestjs/common";
import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  CommissionTaxpayerType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCommissionService } from "./admin-commission.service";

/**
 * BLOCKER: en az bir AKTİF catch-all komisyon kuralının varlığı dağıtım
 * önkoşuludur — yoksa eşleşmeyen kategori/tutar kombinasyonlarında checkout
 * fail-closed 503 verir. `deleteCommissionRule` son catch-all kuralı sorgusuz
 * siliyordu; `updateCommissionRule` de onu pasife alabiliyordu.
 */
describe("AdminCommissionService — catch-all rule protection", () => {
  const catchAll = (over: Partial<any> = {}) => ({
    id: "catch-all",
    name: "Varsayılan",
    ruleType: CommissionRuleType.default,
    categoryId: null,
    sellerType: CommissionSellerType.ALL,
    taxpayerType: CommissionTaxpayerType.all,
    minAmount: null,
    maxAmount: null,
    appliesTo: CommissionAppliesTo.BOTH,
    isActive: true,
    ...over,
  });

  const makeService = (rules: any[]) => {
    const prisma = {
      commissionRule: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(rules.find((r) => r.id === where.id) ?? null),
          ),
        // Overlap validasyonu aynı ekseni sorgular; `id: { not }` hariç tutmasına
        // uymazsak kuralın kendisi "çakışma" sanılır ve test yanlış nedenle geçer.
        findMany: jest.fn().mockImplementation(({ where }: any = {}) => {
          const excluded = where?.id?.not;
          return Promise.resolve(
            rules.filter((r) => (excluded ? r.id !== excluded : true)),
          );
        }),
        count: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(rules.filter((r) => r.isActive).length),
          ),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminCommissionService(
      prisma as unknown as PrismaService,
      audit as unknown as AdminAuditService,
    );
    return { service, prisma };
  };

  it("son aktif catch-all kural silinemez", async () => {
    const { service, prisma } = makeService([catchAll()]);

    await expect(
      service.deleteCommissionRule("admin-1", "catch-all"),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.commissionRule.delete).not.toHaveBeenCalled();
  });

  it("başka aktif catch-all varsa silinebilir", async () => {
    const { service, prisma } = makeService([
      catchAll(),
      catchAll({ id: "catch-all-2", name: "Yedek" }),
    ]);

    await expect(
      service.deleteCommissionRule("admin-1", "catch-all"),
    ).resolves.toEqual({ success: true });
    expect(prisma.commissionRule.delete).toHaveBeenCalled();
  });

  it("catch-all olmayan kural serbestçe silinebilir", async () => {
    const { service, prisma } = makeService([
      catchAll(),
      catchAll({ id: "cat-rule", categoryId: "c1" }),
    ]);

    await service.deleteCommissionRule("admin-1", "cat-rule");

    expect(prisma.commissionRule.delete).toHaveBeenCalled();
  });

  it("son aktif catch-all pasife alınamaz", async () => {
    const { service, prisma } = makeService([catchAll()]);

    await expect(
      service.updateCommissionRule("admin-1", "catch-all", {
        isActive: false,
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.commissionRule.update).not.toHaveBeenCalled();
  });
});
