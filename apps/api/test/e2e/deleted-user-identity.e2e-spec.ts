import { getPrisma, disconnectPrisma } from "../test-utils/db";

/**
 * Kimlik arşivinin DB seviyesindeki garantileri (migration:
 * 20260909090000_deleted_user_identity).
 *
 * Saf veri katmanı testi: NestJS app boot etmiyor, yalnız Prisma + raw SQL.
 *
 *  1) SİLİNEMEZLİK — arşivin tek işi "hesap silinse bile duruyor" olmak; bu
 *     garanti kod disiplinine bırakılamaz.
 *  2) ZENGİNLEŞTİRME serbest, GERİLEME yasak — backfill boş kolonu doldurabilir
 *     ama dolu bir kimlik kolonu NULL'a çekilemez (sessiz veri kaybı).
 *  3) FK RESTRICT — arşivli bir kullanıcı fiziksel olarak silinemez.
 */
describe("deleted_user_identities DB garantileri (E2E)", () => {
  const prisma = getPrisma();
  const created: string[] = [];

  afterAll(async () => {
    // Satırlar tetikleyici yüzünden silinemez; imha bayrağıyla temizlenir.
    for (const userId of created) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL "tarodan.allow_identity_purge" = 'on'`,
        );
        await tx.deletedUserIdentity.deleteMany({ where: { userId } });
      });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await disconnectPrisma();
  });

  async function insertArchive(
    overrides: Record<string, unknown> = {},
  ): Promise<{ userId: string }> {
    const suffix = Math.random().toString(36).slice(2);
    const user = await prisma.user.create({
      data: {
        email: `archive-${suffix}@example.com`,
        displayName: "Arşiv Test",
        passwordHash: "",
      },
      select: { id: true, username: true, createdAt: true },
    });
    created.push(user.id);

    const deletedAt = new Date();
    const retainUntil = new Date(deletedAt);
    retainUntil.setFullYear(retainUntil.getFullYear() + 10);

    await prisma.deletedUserIdentity.create({
      data: {
        userId: user.id,
        username: user.username,
        email: `archive-${suffix}@example.com`,
        displayName: "Arşiv Test",
        nationalId: "12345678901",
        registeredAt: user.createdAt,
        deletedAt,
        retainUntil,
        ...overrides,
      },
    });
    return { userId: user.id };
  }

  it("DELETE'i reddeder (yasal saklama kaydı)", async () => {
    const { userId } = await insertArchive();

    await expect(
      prisma.deletedUserIdentity.delete({ where: { userId } }),
    ).rejects.toThrow(/yasal saklama/i);

    expect(
      await prisma.deletedUserIdentity.findUnique({ where: { userId } }),
    ).not.toBeNull();
  });

  it("toplu DELETE'i de reddeder (satır bazlı tetikleyici)", async () => {
    const { userId } = await insertArchive();

    await expect(
      prisma.deletedUserIdentity.deleteMany({ where: { userId } }),
    ).rejects.toThrow(/yasal saklama/i);
  });

  it("imha bayrağı açıkken silmeye izin verir", async () => {
    const { userId } = await insertArchive();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL "tarodan.allow_identity_purge" = 'on'`,
      );
      await tx.deletedUserIdentity.delete({ where: { userId } });
    });

    expect(
      await prisma.deletedUserIdentity.findUnique({ where: { userId } }),
    ).toBeNull();
  });

  it("boş kolonun sonradan doldurulmasına izin verir (backfill zenginleştirme)", async () => {
    const { userId } = await insertArchive({ taxId: null });

    await prisma.deletedUserIdentity.update({
      where: { userId },
      data: { taxId: "1234567890" },
    });

    const row = await prisma.deletedUserIdentity.findUnique({
      where: { userId },
    });
    expect(row?.taxId).toBe("1234567890");
  });

  it("dolu kimlik kolonunun NULL'a çekilmesini reddeder", async () => {
    const { userId } = await insertArchive();

    await expect(
      prisma.deletedUserIdentity.update({
        where: { userId },
        data: { nationalId: null },
      }),
    ).rejects.toThrow(/NULL/i);

    const row = await prisma.deletedUserIdentity.findUnique({
      where: { userId },
    });
    expect(row?.nationalId).toBe("12345678901");
  });

  it("arşivli kullanıcının fiziksel silinmesini FK ile engeller", async () => {
    const { userId } = await insertArchive();

    await expect(
      prisma.user.delete({ where: { id: userId } }),
    ).rejects.toBeDefined();

    expect(
      await prisma.user.findUnique({ where: { id: userId } }),
    ).not.toBeNull();
  });

  it("kullanıcı başına tek arşiv satırı tutar", async () => {
    const { userId } = await insertArchive();

    await expect(
      prisma.deletedUserIdentity.create({
        data: {
          userId,
          username: "ikinci",
          registeredAt: new Date(),
          deletedAt: new Date(),
          retainUntil: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
