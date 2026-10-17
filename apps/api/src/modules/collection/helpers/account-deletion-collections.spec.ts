import { hideCollectionsForAccountDeletion } from "./account-deletion-collections";

/**
 * Hesap silme (KVKK): silinen kullanıcının herkese açık koleksiyonları
 * gizlenir; anonim hesabın vitrini olarak yayında kalmaz.
 */
describe("hideCollectionsForAccountDeletion", () => {
  const makeTx = (publicIds: string[]) => ({
    collection: {
      findMany: jest.fn().mockResolvedValue(publicIds.map((id) => ({ id }))),
      updateMany: jest.fn().mockResolvedValue({ count: publicIds.length }),
    },
  });

  it("yalnız kullanıcının herkese açık koleksiyonlarını seçer", async () => {
    const tx = makeTx([]);

    await hideCollectionsForAccountDeletion(tx as never, "user-1");

    expect(tx.collection.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isPublic: true },
      select: { id: true },
    });
  });

  it("açık koleksiyon yoksa hiçbir şey yazmaz", async () => {
    const tx = makeTx([]);

    await expect(
      hideCollectionsForAccountDeletion(tx as never, "user-1"),
    ).resolves.toEqual([]);
    expect(tx.collection.updateMany).not.toHaveBeenCalled();
  });

  it("koleksiyonları silmeden gizler ve kimliklerini döner", async () => {
    const tx = makeTx(["c1", "c2"]);

    await expect(
      hideCollectionsForAccountDeletion(tx as never, "user-1"),
    ).resolves.toEqual(["c1", "c2"]);
    expect(tx.collection.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1", "c2"] } },
      data: { isPublic: false },
    });
  });
});
