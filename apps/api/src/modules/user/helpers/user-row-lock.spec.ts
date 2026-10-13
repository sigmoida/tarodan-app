import { ForbiddenException } from "@nestjs/common";
import { lockActiveUsersShared, lockUserForDeletion } from "./user-row-lock";

/**
 * Hesap silme (alıcı tarafı TOCTOU): silme kullanıcı satırını FOR UPDATE,
 * checkout / teklif kabulü / takas işlemleri FOR SHARE kilitler; böylece
 * anonimleşen alıcıda açık sipariş kalmaz.
 */
describe("user row locks", () => {
  const makeTx = (rows: Array<{ id: string; deleted_at: Date | null }>) => ({
    $queryRaw: jest.fn().mockResolvedValue(rows),
  });
  const sqlOf = (tx: { $queryRaw: jest.Mock }) =>
    (tx.$queryRaw.mock.calls[0][0] as string[]).join("?").replace(/\s+/g, " ");

  describe("lockActiveUsersShared", () => {
    it("kullanıcı satırlarını sıralı FOR SHARE ile kilitler", async () => {
      const tx = makeTx([{ id: "a", deleted_at: null }]);

      await lockActiveUsersShared(tx as never, ["b", "a", "b"]);

      expect(sqlOf(tx)).toContain("FROM users");
      expect(sqlOf(tx)).toContain("ORDER BY id FOR SHARE");
      // Tekilleştirilmiş ve sıralı kimlikler (Prisma.join değerleri).
      expect(tx.$queryRaw.mock.calls[0][1].values).toEqual(["a", "b"]);
    });

    it("silinmiş hesap bulunursa işlemi reddeder", async () => {
      const tx = makeTx([
        { id: "a", deleted_at: null },
        { id: "b", deleted_at: new Date() },
      ]);

      const error = await lockActiveUsersShared(tx as never, ["a", "b"]).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        i18nKey: "server.auth.accountDeleted",
      });
    });

    it("aktif hesaplarda sessizce geçer; bulunamayan kimlik başka denetimlere kalır", async () => {
      const tx = makeTx([]);

      await expect(
        lockActiveUsersShared(tx as never, ["missing"]),
      ).resolves.toBeUndefined();
    });

    it("kimlik yoksa sorgu atmaz", async () => {
      const tx = makeTx([]);

      await lockActiveUsersShared(tx as never, []);

      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("lockUserForDeletion", () => {
    it("silinen kullanıcının satırını FOR UPDATE kilitler", async () => {
      const tx = makeTx([]);

      await lockUserForDeletion(tx as never, "u1");

      expect(sqlOf(tx)).toContain("FROM users WHERE id = ?");
      expect(sqlOf(tx)).toContain("FOR UPDATE");
      expect(tx.$queryRaw.mock.calls[0][1]).toBe("u1");
    });
  });
});
