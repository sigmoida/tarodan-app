import { BadRequestException } from "@nestjs/common";
import { EmailChangeService } from "./email-change.service";

describe("EmailChangeService delivery failure", () => {
  it("removes the unusable token and does not report a successful request", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: "current@example.com",
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      emailChangeToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: "token-1" }),
        delete: jest.fn().mockResolvedValue({ id: "token-1" }),
      },
    };
    const notification = {
      sendEmailChangeCode: jest.fn().mockResolvedValue({
        success: false,
        error: "provider unavailable",
      }),
    };
    const service = new EmailChangeService(prisma as any, notification as any);

    await expect(
      service.requestChange("user-1", "new@example.com"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.emailChangeToken.delete).toHaveBeenCalledWith({
      where: { id: "token-1" },
    });
  });
});
