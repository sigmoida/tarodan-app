import { MessageStatus } from "@prisma/client";
import { MessageAttachmentAccessService } from "./message-attachment-access.service";

/**
 * Mesaj ekini kim okuyabilir: yükleyen ya da eki taşıyan, YÜKLEYENİN
 * gönderdiği görünür bir mesajın alıcısı. Başkasının ek id'sini kendi
 * mesajına gömen biri (gönderen ≠ yükleyen) erişim kazanmaz.
 */
describe("MessageAttachmentAccessService.canRead", () => {
  const FILE_ID = "0b0f6c3e-8a2d-4c1b-9f51-3a7e2d9c4b10";
  const UPLOADER = "user-uploader";
  const RECEIVER = "user-receiver";

  function createService(found: { id: string } | null) {
    const prisma = {
      message: { findFirst: jest.fn().mockResolvedValue(found) },
    };
    return {
      service: new MessageAttachmentAccessService(prisma as never),
      prisma,
    };
  }

  it("yükleyen kendi ekini okur — mesaj sorgusu yok", async () => {
    const { service, prisma } = createService(null);

    await expect(
      service.canRead({ id: FILE_ID, uploaderId: UPLOADER }, UPLOADER),
    ).resolves.toBe(true);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it("alıcı: yükleyenin gönderdiği görünür mesajda ek varsa okur", async () => {
    const { service, prisma } = createService({ id: "m1" });

    await expect(
      service.canRead({ id: FILE_ID, uploaderId: UPLOADER }, RECEIVER),
    ).resolves.toBe(true);
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        content: { contains: `/api/media/message-attachment/${FILE_ID}` },
        deletedAt: null,
        status: { in: [MessageStatus.sent, MessageStatus.approved] },
        senderId: UPLOADER,
        receiverId: RECEIVER,
      },
      select: { id: true },
    });
  });

  it("böyle bir mesaj yoksa (yabancı / reddedilmiş mesaj) okuyamaz", async () => {
    const { service } = createService(null);

    await expect(
      service.canRead({ id: FILE_ID, uploaderId: UPLOADER }, "user-stranger"),
    ).resolves.toBe(false);
  });

  it("yükleyeni bilinmeyen eski kayıt: mesajın iki tarafı da okuyabilir", async () => {
    const { service, prisma } = createService({ id: "m1" });

    await expect(
      service.canRead({ id: FILE_ID, uploaderId: null }, RECEIVER),
    ).resolves.toBe(true);
    expect(prisma.message.findFirst.mock.calls[0][0].where).toMatchObject({
      OR: [{ senderId: RECEIVER }, { receiverId: RECEIVER }],
    });
  });
});
