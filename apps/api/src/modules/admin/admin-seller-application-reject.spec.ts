import { AdminSellerApplicationService } from "./admin-seller-application.service";

/**
 * Aktivasyon SONRASI (kullanıcı hesabı yaratıldıktan sonra) reddedilen
 * başvuruda kullanıcı satırı da "rejected" olmalı.
 *
 * Eskiden reject yalnız BAŞVURUYU rejected yapıyordu; `user.businessStatus`
 * "pending"de kalıyordu — hiçbir kod yolu onu "rejected" yazmıyordu. Kullanıcı
 * web guard'ı tarafından sonsuza dek /business-pending'e ("başvurunuz
 * inceleniyor") kilitleniyor, /business-rejected ekranı ölü kod kalıyordu.
 */
describe("AdminSellerApplicationService.rejectSellerApplication", () => {
  const makeService = (application: Record<string, unknown>) => {
    const prisma = {
      corporateApplication: {
        findUnique: jest.fn().mockResolvedValue(application),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as any)),
    };
    const audit = { createAuditLog: jest.fn() };
    const notificationService = {
      sendTemplateEmailToAddress: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminSellerApplicationService(
      prisma as any,
      {} as any,
      notificationService as any,
      audit as any,
      {} as any,
    );
    return { service, prisma };
  };

  const baseApplication = {
    id: "app-1",
    status: "under_review",
    companyEmail: "firma@ornek.com",
    authorizedFullName: "Yetkili Kişi",
    companyTitle: "Firma AŞ",
  };

  it("hesabı yaratılmış başvuruda user.businessStatus=rejected yazılır", async () => {
    const { service, prisma } = makeService({
      ...baseApplication,
      userId: "user-1",
    });

    await service.rejectSellerApplication("admin-1", "app-1", "Belgeler sahte");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ businessStatus: "rejected" }),
      }),
    );
  });

  it("henüz hesap yaratılmamış (submitted) başvuruda user'a dokunulmaz", async () => {
    const { service, prisma } = makeService({
      ...baseApplication,
      status: "submitted",
      userId: null,
    });

    await service.rejectSellerApplication("admin-1", "app-1", "Eksik bilgi");

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
