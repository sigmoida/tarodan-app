import { MediaService } from "./media.service";
import {
  messageAttachmentIdFromUrl,
  messageAttachmentUrl,
} from "./helpers/message-attachment-url";

/**
 * Mesaj gövdesindeki `[IMG:…]` hedefleri yalnız bu sunucunun ürettiği mesaj eki
 * URL'si olabilir ve ek GÖNDERİCİNİN yüklediği `messages` kökü dosyası olmalı.
 * Alıcının istemcisi hedefi kendi oturum jetonuyla yüklediği için harici URL
 * jeton sızıntısı / izleme pikseli demektir.
 */
const API_URL = "https://api.tarodan.test";
const SENDER = "user-sender";
const OWN_ID = "0b0f6c3e-8a2d-4c1b-9f51-3a7e2d9c4b10";
const FOREIGN_ID = "7d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f";
const own = `${API_URL}/api/media/message-attachment/${OWN_ID}`;
const foreign = `${API_URL}/api/media/message-attachment/${FOREIGN_ID}`;

function createService(ownedIds: string[] = [OWN_ID]) {
  const prisma = {
    mediaFile: {
      findMany: jest.fn().mockResolvedValue(ownedIds.map((id) => ({ id }))),
    },
  };
  const config = {
    get: jest.fn((key: string) => (key === "API_URL" ? API_URL : undefined)),
  };
  const service = new MediaService(
    config as never,
    {} as never, // MembershipService
    {} as never, // StorageService
    prisma as never,
  );
  return { service, prisma };
}

describe("message-attachment-url helper", () => {
  it("URL'yi kurar ve id'yi geri çözer (sondaki / kırpılır)", () => {
    const url = messageAttachmentUrl(`${API_URL}/`, OWN_ID);
    expect(url).toBe(own);
    expect(messageAttachmentIdFromUrl(url)).toBe(OWN_ID);
  });

  it("biçim dışı değerlerde null", () => {
    expect(messageAttachmentIdFromUrl("https://evil.example/x.png")).toBeNull();
    expect(messageAttachmentIdFromUrl(`${own}?x=1`)).toBeNull();
    expect(messageAttachmentIdFromUrl(`${own}/../x`)).toBeNull();
    expect(
      messageAttachmentIdFromUrl(
        `${API_URL}/api/media/message-attachment/not-a-uuid`,
      ),
    ).toBeNull();
  });
});

describe("MediaService.findInvalidMessageAttachmentTargets", () => {
  it("göndericinin kendi eki → geçerli; sorgu messages kökü + uploader ile sınırlı", async () => {
    const { service, prisma } = createService();

    await expect(
      service.findInvalidMessageAttachmentTargets([own], SENDER),
    ).resolves.toEqual([]);
    expect(prisma.mediaFile.findMany).toHaveBeenCalledWith({
      where: { id: { in: [OWN_ID] }, bucket: "messages", uploaderId: SENDER },
      select: { id: true },
    });
  });

  it("harici URL, çıplak key, relatif yol ve yerel şemalar geçersiz", async () => {
    const { service } = createService();
    const targets = [
      "https://attacker.example/x.png",
      "dev/messages/user-sender/a.jpg",
      `/api/media/message-attachment/${OWN_ID}`,
      "file:///etc/passwd",
      "",
    ];

    await expect(
      service.findInvalidMessageAttachmentTargets(targets, SENDER),
    ).resolves.toEqual(targets);
  });

  it("doğru yol ama BAŞKA kök (API_URL değil) → geçersiz", async () => {
    const { service } = createService();
    const spoofed = `https://attacker.example/api/media/message-attachment/${OWN_ID}`;

    await expect(
      service.findInvalidMessageAttachmentTargets([spoofed], SENDER),
    ).resolves.toEqual([spoofed]);
  });

  it("başkasının eki (sahiplik tutmuyor) → geçersiz", async () => {
    const { service } = createService([OWN_ID]);

    await expect(
      service.findInvalidMessageAttachmentTargets([own, foreign], SENDER),
    ).resolves.toEqual([foreign]);
  });

  it("geçerli id yoksa veritabanına hiç gitmez", async () => {
    const { service, prisma } = createService();

    await service.findInvalidMessageAttachmentTargets(
      ["https://attacker.example/x.png"],
      SENDER,
    );
    expect(prisma.mediaFile.findMany).not.toHaveBeenCalled();
  });

  it("aynı ek iki kez gömülürse tek id ile sorgular", async () => {
    const { service, prisma } = createService();

    await expect(
      service.findInvalidMessageAttachmentTargets([own, own], SENDER),
    ).resolves.toEqual([]);
    expect(prisma.mediaFile.findMany.mock.calls[0]).toEqual([
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [OWN_ID] } }),
      }),
    ]);
  });
});
