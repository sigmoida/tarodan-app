import { allocateUsernameFromEmail } from "./username.util";

/**
 * Sosyal giriş (Google/Apple) ve admin daveti kullanıcı adı SORMAZ; hesap
 * e-postadan türetilmiş bir kullanıcı adıyla açılır. Türetilmezse hesap
 * veritabanının `legacy_########` yer tutucusuyla kalır ve herkese açık
 * yüzeylerde gerçek adıyla görünürdü — bu iş bunu önlüyor.
 */
describe("allocateUsernameFromEmail", () => {
  const prismaWith = (taken: string[]) => {
    const findUnique = jest.fn(({ where }: any) =>
      Promise.resolve(taken.includes(where.username) ? { id: "x" } : null),
    );
    return { prisma: { user: { findUnique } } as any, findUnique };
  };

  it("derives the username from the email local part", async () => {
    const { prisma } = prismaWith([]);
    await expect(
      allocateUsernameFromEmail(prisma, "Kaan.Merakli@gmail.com"),
    ).resolves.toBe("kaan.merakli");
  });

  it("walks past names that are already taken", async () => {
    const { prisma } = prismaWith(["kaan", "kaan1"]);
    await expect(
      allocateUsernameFromEmail(prisma, "kaan@gmail.com"),
    ).resolves.toBe("kaan2");
  });

  it("never hands out a reserved name", async () => {
    const { prisma } = prismaWith([]);
    await expect(
      allocateUsernameFromEmail(prisma, "support@tarodan.com"),
    ).resolves.not.toBe("support");
  });

  it("checks availability against the database", async () => {
    const { prisma, findUnique } = prismaWith([]);
    await allocateUsernameFromEmail(prisma, "kaan@gmail.com");
    expect(findUnique).toHaveBeenCalledWith({
      where: { username: "kaan" },
      select: { id: true },
    });
  });
});
