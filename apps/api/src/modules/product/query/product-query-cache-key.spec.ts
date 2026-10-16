import { accountLaneServiceStub } from "../../account-lane/account-lane.testing";
import { ProductQueryService } from "./product-query.service";

/**
 * `products:list:` cache anahtarı sonucu değiştiren HER liste filtresini
 * içermeli; aksi halde iki farklı istek 120-300 sn aynı (yanlış) sayfayı paylaşır.
 */
describe("ProductQueryService.findAll — list cache key", () => {
  const build = () => {
    const keys: string[] = [];
    const cache = {
      getOrSet: jest.fn((key: string, factory: () => Promise<unknown>) => {
        keys.push(key);
        return factory();
      }),
    };
    const service = new ProductQueryService(
      {} as any,
      cache as any,
      { isAvailable: () => false } as any,
      {} as any,
      {} as any,
      { getHiddenUserIds: jest.fn().mockResolvedValue([]) } as any,
      accountLaneServiceStub() as any,
    );
    jest
      .spyOn(service as any, "findAllViaPostgres")
      .mockResolvedValue({ data: [], meta: {} });
    return { service, keys };
  };

  const keyFor = async (query: Record<string, unknown>) => {
    const { service, keys } = build();
    await service.findAll({ page: 1, limit: 20, ...query } as any, "viewer");
    return keys[0];
  };

  it("separates requests that differ only by manufacturer name", async () => {
    const bruder = await keyFor({ manufacturer: "Bruder" });
    const hotWheels = await keyFor({ manufacturer: "Hot Wheels" });
    const none = await keyFor({});
    expect(new Set([bruder, hotWheels, none]).size).toBe(3);
  });

  it("ignores the manufacturer name once manufacturerId is present", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    const a = await keyFor({ manufacturerId: id, manufacturer: "Bruder" });
    const b = await keyFor({ manufacturerId: id, manufacturer: "Siku" });
    expect(a).toBe(b);
  });

  // ProductQueryDto'daki, findAll'ın okuduğu her filtre/sıralama alanı. Yeni bir
  // filtre eklenince buraya da eklenmeli (anahtara girmezse test kırmızı olur).
  // inactiveReason / tradeEligible yalnız satıcının kendi listesinde (/products/my)
  // okunur; findAll'a hiç girmez, bu yüzden listede yoklar.
  const FILTER_SAMPLES: Record<string, unknown> = {
    search: "star wars",
    categoryId: "11111111-1111-4111-8111-111111111111",
    sellerId: "22222222-2222-4222-8222-222222222222",
    brandId: "brand-1",
    status: "active",
    condition: "very_good",
    brand: "Hot Wheels",
    scale: "1:64",
    material: "diecast",
    color: "red,black",
    attributeSlugs: "treasure-hunt",
    attrGroups: '{"hw-rarity":["treasure-hunt"]}',
    tradeOnly: true,
    boostedOnly: true,
    homeShowcase: true,
    discountOnly: true,
    preOrder: true,
    limited: true,
    set: true,
    minPrice: 100,
    maxPrice: 1000,
    sortBy: "price_asc",
    carModelId: "33333333-3333-4333-8333-333333333333",
    manufacturerId: "44444444-4444-4444-8444-444444444444",
    manufacturer: "Bruder",
  };

  it.each(Object.entries(FILTER_SAMPLES))(
    "includes the %s filter in the key",
    async (field, value) => {
      expect(await keyFor({ [field]: value })).not.toBe(await keyFor({}));
    },
  );
});
