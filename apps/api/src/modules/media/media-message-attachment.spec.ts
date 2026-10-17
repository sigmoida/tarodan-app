import { NotFoundException } from "@nestjs/common";
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
    {} as never, // MessageAttachmentAccessService
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

/**
 * IDOR: `GET /media/message-attachment/:id` eskiden her oturumlu kullanıcıya
 * her eki çözüyordu. Artık yalnız yükleyen ya da eki taşıyan mesajın alıcısı;
 * diğer herkes (ve biçim dışı id) VARLIĞI sızdırmayan 404 alır.
 */
describe("MediaService.getMessageAttachmentPresignedUrl — erişim", () => {
  const UPLOADER = "user-uploader";
  const STRANGER = "user-stranger";
  const file = {
    id: OWN_ID,
    key: "dev/messages/user-uploader/a.jpg",
    bucket: "messages",
    uploaderId: UPLOADER,
  };

  function createReader(found: typeof file | null = file, canRead = false) {
    const prisma = {
      mediaFile: { findUnique: jest.fn().mockResolvedValue(found) },
    };
    const storage = {
      getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://signed/x"),
    };
    const access = { canRead: jest.fn().mockResolvedValue(canRead) };
    const service = new MediaService(
      { get: jest.fn() } as never,
      {} as never,
      storage as never,
      prisma as never,
      access as never,
    );
    return { service, prisma, storage, access };
  }

  it("yetkisiz kullanıcı → 404 (403 değil), presigned üretilmez", async () => {
    const { service, storage, access } = createReader(file, false);

    await expect(
      service.getMessageAttachmentPresignedUrl(OWN_ID, { id: STRANGER }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(access.canRead).toHaveBeenCalledWith(
      expect.objectContaining({ id: OWN_ID, uploaderId: UPLOADER }),
      STRANGER,
    );
    expect(storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("erişimi olan (yükleyen/alıcı) → messages kökünden presigned", async () => {
    const { service, storage } = createReader(file, true);

    await expect(
      service.getMessageAttachmentPresignedUrl(OWN_ID, { id: UPLOADER }),
    ).resolves.toBe("https://signed/x");
    expect(storage.getPresignedDownloadUrl).toHaveBeenCalledWith(
      "messages",
      file.key,
      600,
    );
  });

  it("isAdmin bayrağı tek başına erişim VERMEZ (bu uçta admin yolu yok)", async () => {
    const { service, access } = createReader(file, false);

    await expect(
      service.getMessageAttachmentPresignedUrl(OWN_ID, {
        id: "someone",
        isAdmin: true,
      } as { id: string }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(access.canRead).toHaveBeenCalled();
  });

  it("başka bucket'taki dosya → 404 (yetkili olsa bile)", async () => {
    const { service, access } = createReader(
      { ...file, bucket: "documents" },
      true,
    );

    await expect(
      service.getMessageAttachmentPresignedUrl(OWN_ID, { id: UPLOADER }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(access.canRead).not.toHaveBeenCalled();
  });

  it("biçim dışı id → veritabanına gitmeden 404", async () => {
    const { service, prisma } = createReader();

    for (const id of ["not-a-uuid", "../x", `${OWN_ID}\u0000`, ""]) {
      await expect(
        service.getMessageAttachmentPresignedUrl(id, { id: UPLOADER }),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(prisma.mediaFile.findUnique).not.toHaveBeenCalled();
  });

  it("kayıt yok → 404", async () => {
    const { service } = createReader(null, true);

    await expect(
      service.getMessageAttachmentPresignedUrl(FOREIGN_ID, { id: UPLOADER }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
