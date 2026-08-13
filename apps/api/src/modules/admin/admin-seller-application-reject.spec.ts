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
      createInAppNotification: jest.fn().mockResolvedValue(true),
    };
    const service = new AdminSellerApplicationService(
      prisma as any,
      {} as any,
      notificationService as any,
      audit as any,
      {} as any,
    );
    return { service, prisma, notificationService };
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
    const { service, prisma, notificationService } = makeService({
      ...baseApplication,
      status: "submitted",
      userId: null,
    });

    await service.rejectSellerApplication("admin-1", "app-1", "Eksik bilgi");

    expect(prisma.user.update).not.toHaveBeenCalled();
    // Bildirilecek kullanıcı hesabı yok → in-app bildirim de yok.
    expect(notificationService.createInAppNotification).not.toHaveBeenCalled();
  });

  it("hesabı olan başvuruda kullanıcıya SELLER_APPLICATION_REJECTED düşer", async () => {
    const { service, notificationService } = makeService({
      ...baseApplication,
      userId: "user-1",
    });

    await service.rejectSellerApplication("admin-1", "app-1", "Belgeler sahte");

    expect(notificationService.createInAppNotification).toHaveBeenCalledWith(
      "user-1",
      "seller_application_rejected",
      { reason: " Belgeler sahte" },
    );
  });

  it("bildirim hatası reddi geri almaz", async () => {
    const { service, notificationService } = makeService({
      ...baseApplication,
      userId: "user-1",
    });
    notificationService.createInAppNotification.mockRejectedValue(
      new Error("push down"),
    );

    await expect(
      service.rejectSellerApplication("admin-1", "app-1", "Belgeler sahte"),
    ).resolves.toEqual({ success: true });
  });
});

/**
 * Nihai onayda başvurana in-app+push SELLER_APPLICATION_APPROVED düşmeli
 * (şablon + link sözleşmesi zaten vardı; emisyon ölüydü).
 */
describe("AdminSellerApplicationService.finalApproveSellerApplication", () => {
  const approvedDoc = (
    documentType: string,
    stakeholderId: string | null = null,
  ) => ({ documentType, status: "approved", stakeholderId });

  const application = {
    id: "app-1",
    status: "under_review",
    companyEmail: "firma@ornek.com",
    authorizedFullName: "Yetkili Kişi",
    companyTitle: "Firma AŞ",
    companyLegalName: "Firma Anonim Şirketi",
    taxId: "1234567890",
    companyType: "anonim",
    documents: [
      "tax_plate",
      "contract",
      "signature_circular",
      "activity_certificate",
      "residence_or_invoice",
      "trade_registry_gazette",
      "bank_account_info",
    ].map((type) => approvedDoc(type)),
    stakeholders: [
      {
        identityType: "tckn",
        documents: [
          approvedDoc("identity_front", "st-1"),
          approvedDoc("identity_back", "st-1"),
        ],
      },
    ],
    user: { id: "user-1", adminCode: "B010023" },
  };

  const makeService = () => {
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
      createInAppNotification: jest.fn().mockResolvedValue(true),
    };
    const service = new AdminSellerApplicationService(
      prisma as any,
      {} as any,
      notificationService as any,
      audit as any,
      {} as any,
    );
    return { service, prisma, notificationService };
  };

  it("başvurana SELLER_APPLICATION_APPROVED bildirimi gönderir", async () => {
    const { service, notificationService } = makeService();

    await expect(
      service.finalApproveSellerApplication("admin-1", "app-1"),
    ).resolves.toEqual({ success: true, status: "approved" });

    expect(notificationService.createInAppNotification).toHaveBeenCalledWith(
      "user-1",
      "seller_application_approved",
    );
  });

  it("bildirim hatası onayı geri almaz", async () => {
    const { service, notificationService } = makeService();
    notificationService.createInAppNotification.mockRejectedValue(
      new Error("push down"),
    );

    await expect(
      service.finalApproveSellerApplication("admin-1", "app-1"),
    ).resolves.toEqual({ success: true, status: "approved" });
  });
});
