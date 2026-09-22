import { accountLaneServiceStub } from "../../account-lane/account-lane.testing";
import { UserDiscoveryService } from "./user-discovery.service";

/**
 * Ana sayfa keşif yüzeyleri de şeride duyarlı olmalı: test hesabı canlı
 * satıcı kartlarını görmemeli (ürün sorgusu zaten şeride duyarlı olduğu için
 * kart tıklanınca boş profil açılırdı — reviewer'a bozuk deneyim).
 */
describe("UserDiscoveryService — test lane", () => {
  const build = () => {
    const prisma = {
      user: { findMany: jest.fn(async (_a: any): Promise<any[]> => []) },
      collection: { findMany: jest.fn(async (_a: any): Promise<any[]> => []) },
      product: { findMany: jest.fn(async (_a: any): Promise<any[]> => []) },
    };
    const cache = {
      getOrSet: jest.fn((_k: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
      del: jest.fn(),
    };
    const service = new UserDiscoveryService(
      prisma as never,
      { getPublicAssetUrl: () => undefined } as never,
      cache as never,
      { resolveProductImageUrl: () => undefined } as never,
      { getHiddenUserIds: jest.fn(async () => []) } as never,
      accountLaneServiceStub({ tester: "test" }) as never,
    );
    return { service, prisma, cache };
  };

  const whereOf = (fn: jest.Mock) =>
    JSON.stringify((fn.mock.calls[0] as any[])[0].where);

  it("scopes top sellers to the viewer's lane", async () => {
    const { service, prisma } = build();
    await service.getTopSellers(5, "tester");
    expect(whereOf(prisma.user.findMany as jest.Mock)).toContain(
      '"isTestAccount":true',
    );
  });

  it("keeps live viewers on live sellers", async () => {
    const { service, prisma } = build();
    await service.getTopSellers(5, "someone");
    expect(whereOf(prisma.user.findMany as jest.Mock)).toContain(
      '"isTestAccount":false',
    );
  });

  it("scopes seller search to the viewer's lane", async () => {
    const { service, prisma } = build();
    await service.searchSellers("por", 8, "tester");
    expect(whereOf(prisma.user.findMany as jest.Mock)).toContain(
      '"isTestAccount":true',
    );
  });

  it("scopes top collections and keys the cache per lane", async () => {
    const { service, prisma, cache } = build();
    await service.getTopCollections(20, "tester");
    expect(whereOf(prisma.collection.findMany as jest.Mock)).toContain(
      '"isTestAccount":true',
    );
    await service.getTopCollections(20, "someone");
    const keys = cache.getOrSet.mock.calls.map((c) => c[0] as string);
    expect(keys[0]).toContain(":test:");
    expect(keys[1]).toContain(":live:");
    expect(keys[0]).not.toBe(keys[1]);
  });
});
