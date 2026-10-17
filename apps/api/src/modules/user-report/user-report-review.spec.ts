import { NotFoundException } from "@nestjs/common";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UserReportService } from "./user-report.service";
import { CreateReportDto, ReportReason, ReportType } from "./dto";

/**
 * S9c — Apple 1.2: yorumlar `ReportType.REVIEW` ile şikayet edilebilir.
 * `targetId` bir ürün yorumu (`ProductRating`) ya da satıcı değerlendirmesi
 * (`Rating`) olabilir; sunucu ikisinde de arar ve admin detayına tek şekil
 * döner.
 */
describe("UserReportService — yorum şikayeti", () => {
  const reportRow = {
    id: "r1",
    type: "review",
    targetId: "rev-1",
    reason: "harassment",
    description: null,
    status: "pending",
    createdAt: new Date(),
    resolvedAt: null,
    adminNote: null,
  };

  const makeService = (opts: {
    productReview?: Record<string, unknown> | null;
    sellerReview?: Record<string, unknown> | null;
  }) => {
    const prisma = {
      productRating: {
        findUnique: jest.fn().mockResolvedValue(opts.productReview ?? null),
      },
      rating: {
        findUnique: jest.fn().mockResolvedValue(opts.sellerReview ?? null),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: "A" }) },
      report: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(reportRow),
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...reportRow, reporter: { id: "u1" } }),
      },
    };
    const notifications = { notifyAllAdmins: jest.fn().mockResolvedValue(1) };
    const service = new UserReportService(
      prisma as never,
      notifications as never,
    );
    return { service, prisma, notifications };
  };

  const dto = {
    type: ReportType.REVIEW,
    targetId: "rev-1",
    reason: ReportReason.HARASSMENT,
  };

  it("DTO 'review' türünü kabul eder", async () => {
    const instance = plainToInstance(CreateReportDto, {
      ...dto,
      targetId: "6f1c2a52-6d2f-4f5e-9b1c-1a2b3c4d5e6f",
    });
    expect(await validate(instance)).toHaveLength(0);
  });

  it("ürün yorumu şikayet edilebilir ve adminlere bildirilir", async () => {
    const { service, prisma, notifications } = makeService({
      productReview: { id: "rev-1" },
    });

    const result = await service.createReport("u1", dto);

    expect(result.type).toBe("review");
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "review", targetId: "rev-1" }),
    });
    expect(notifications.notifyAllAdmins).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "review" }),
    );
  });

  it("satıcı değerlendirmesi de şikayet edilebilir", async () => {
    const { service, prisma } = makeService({
      sellerReview: { id: "rev-1" },
    });

    await service.createReport("u1", dto);

    expect(prisma.rating.findUnique).toHaveBeenCalled();
    expect(prisma.report.create).toHaveBeenCalled();
  });

  it("olmayan yorum 404", async () => {
    const { service, prisma } = makeService({});

    const error = await service
      .createReport("u1", dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      i18nKey: "server.rating.reviewNotFound",
    });
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it("admin detayı ürün yorumunu tek şekilde döner", async () => {
    const { service } = makeService({
      productReview: {
        id: "rev-1",
        score: 1,
        title: "Kötü",
        review: "uygunsuz metin",
        status: "approved",
        user: { id: "a1", displayName: "Yazan" },
        product: { id: "p1", title: "Ürün" },
      },
    });

    const detail = await service.getReportById("r1");

    expect(detail.target).toEqual({
      id: "rev-1",
      reviewKind: "product",
      score: 1,
      title: "Kötü",
      comment: "uygunsuz metin",
      status: "approved",
      author: { id: "a1", displayName: "Yazan" },
      product: { id: "p1", title: "Ürün" },
    });
  });

  it("admin detayı satıcı değerlendirmesini tek şekilde döner", async () => {
    const { service } = makeService({
      sellerReview: {
        id: "rev-1",
        score: 2,
        comment: "kaba yorum",
        status: "approved",
        giver: { id: "a1", displayName: "Yazan" },
        receiver: { id: "s1", displayName: "Satıcı" },
      },
    });

    const detail = await service.getReportById("r1");

    expect(detail.target).toEqual({
      id: "rev-1",
      reviewKind: "seller",
      score: 2,
      comment: "kaba yorum",
      status: "approved",
      author: { id: "a1", displayName: "Yazan" },
      receiver: { id: "s1", displayName: "Satıcı" },
    });
  });
});
