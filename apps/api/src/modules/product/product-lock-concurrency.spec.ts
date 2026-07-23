import { ProductLockService } from "./product-lock.service";
import { ProductStatus } from "@prisma/client";

/**
 * STOK EŞ-ZAMANLILIK SENARYOLARI — checkAndReserve, direct-buy / offer-ödeme /
 * trade-accept akışlarının ORTAK rezervasyon primitifidir. Gerçek eş-zamanlı iki
 * transaction bir unit testte koşamaz; ancak `SELECT ... FOR UPDATE` satır kilidi
 * çakışan istekleri SERİLEŞTİRİR — yani "aynı anda" iki akış, DB seviyesinde
 * arka-arkaya (biri diğerinin reservedQuantity artışını görerek) çalışır. Bu testler
 * o serileşmiş yürütmeyi paylaşılan bir bellek-store ile modelleyip oversell'in
 * engellendiğini doğrular (available = quantity - reservedQuantity >= qty).
 */
describe("ProductLockService.checkAndReserve — stok eş-zamanlılık matrisi", () => {
  type Row = {
    id: string;
    quantity: number;
    reservedQuantity: number;
    status: ProductStatus;
  };

  const makeSvc = (store: Record<string, Row>) => {
    const queryRawCalls: string[] = [];
    // Kilitli (serileşmiş) yürütmeyi modelleyen tx: findUnique güncel store'u okur,
    // update store'u mutasyona uğratır → sonraki reserve artmış reserved'ı görür.
    const tx = {
      $queryRaw: jest.fn().mockImplementation((strings: any) => {
        // tagged template: FOR UPDATE, ${productId} interpolasyonundan SONRAKİ
        // parçadadır → tüm parçaları birleştirip yakala.
        queryRawCalls.push(
          Array.isArray(strings) ? strings.join(" ") : String(strings ?? ""),
        );
        return Promise.resolve([]);
      }),
      product: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const row = store[where.id];
          return Promise.resolve(row ? { ...row } : null);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const row = store[where.id];
          if (row && data.reservedQuantity?.increment != null) {
            row.reservedQuantity += data.reservedQuantity.increment; // checkAndReserve
          } else if (row && typeof data.reservedQuantity === "number") {
            row.reservedQuantity = data.reservedQuantity; // releaseReservation (mutlak)
          }
          if (row && typeof data.status === "string") row.status = data.status;
          return Promise.resolve({ ...row });
        }),
      },
    };
    const svc = new ProductLockService({} as any, {} as any);
    const reserve = (id: string, qty = 1) =>
      svc.checkAndReserve(tx as any, id, qty);
    const release = (id: string, qty = 1) =>
      svc.releaseReservation(tx as any, id, qty);
    return { svc, tx, reserve, release, queryRawCalls };
  };

  const row = (over: Partial<Row>): Row => ({
    id: "p1",
    quantity: 1,
    reservedQuantity: 0,
    status: ProductStatus.active,
    ...over,
  });

  it("TEKİL direct-buy: qty-1 ürün için 1 birim rezerve edilir (FOR UPDATE ile)", async () => {
    const store = { p1: row({}) };
    const { reserve, queryRawCalls } = makeSvc(store);

    await reserve("p1", 1);

    expect(store.p1.reservedQuantity).toBe(1);
    // rezervasyondan önce satır kilidi alınmış olmalı
    expect(queryRawCalls.some((q) => /FOR UPDATE/i.test(q))).toBe(true);
  });

  it("2'Lİ aynı ürün (qty-1): yalnız BİRİ kazanır, ikincisi oversell ile reddedilir", async () => {
    const store = { p1: row({ quantity: 1 }) };
    const { reserve } = makeSvc(store);

    await reserve("p1", 1); // 1. akış (ör. direct-buy) — reserved 0→1
    // 2. akış (ör. başka bir direct-buy / offer / trade) — available=0
    await expect(reserve("p1", 1)).rejects.toThrow();

    expect(store.p1.reservedQuantity).toBe(1); // ikinci artırmadı
  });

  it("2'Lİ karışık (direct-buy + trade-accept) aynı qty-1 ürün: ikincisi reddedilir", async () => {
    const store = { p1: row({ quantity: 1 }) };
    const { reserve } = makeSvc(store);

    await reserve("p1", 1); // direct-buy kazandı
    await expect(reserve("p1", 1)).rejects.toThrow(); // trade-accept aynı ürünü alamaz

    expect(store.p1.reservedQuantity).toBe(1);
  });

  it("3'LÜ eş-zamanlı (qty-2 ürün): iki rezerve başarılı, üçüncüsü reddedilir", async () => {
    const store = { p1: row({ quantity: 2 }) };
    const { reserve } = makeSvc(store);

    await reserve("p1", 1); // reserved 0→1
    await reserve("p1", 1); // reserved 1→2 (tam dolu)
    await expect(reserve("p1", 1)).rejects.toThrow(); // available=0

    expect(store.p1.reservedQuantity).toBe(2);
  });

  it("ÇOK-ADETLİ tek sipariş: qty-3 ürün için 3 birim tek seferde rezerve edilir", async () => {
    const store = { p1: row({ quantity: 3 }) };
    const { reserve } = makeSvc(store);

    await reserve("p1", 3);

    expect(store.p1.reservedQuantity).toBe(3);
    // sonrasında 1 birim daha istenirse reddedilir
    await expect(reserve("p1", 1)).rejects.toThrow();
  });

  it("ÇOK-ADETLİ oversell: qty-3 ürün için mevcut 2 rezerve varken 2 daha istenirse reddedilir", async () => {
    const store = { p1: row({ quantity: 3, reservedQuantity: 2 }) };
    const { reserve } = makeSvc(store);

    // available = 3 - 2 = 1 < 2 istenen → red
    await expect(reserve("p1", 2)).rejects.toThrow();
    expect(store.p1.reservedQuantity).toBe(2); // değişmedi
  });

  it("FARKLI ürünler bağımsız rezerve edilir (2'li takas — iki ayrı ürün)", async () => {
    const store = { p1: row({ id: "p1" }), p2: row({ id: "p2" }) };
    const { reserve } = makeSvc(store);

    await reserve("p1", 1);
    await reserve("p2", 1);

    expect(store.p1.reservedQuantity).toBe(1);
    expect(store.p2.reservedQuantity).toBe(1);
  });

  it("SATILMIŞ/pasif ürün rezerve EDİLEMEZ (status guard)", async () => {
    const store = { p1: row({ status: ProductStatus.sold }) };
    const { reserve } = makeSvc(store);

    await expect(reserve("p1", 1)).rejects.toThrow();
    expect(store.p1.reservedQuantity).toBe(0);
  });

  it("OLMAYAN ürün rezerve EDİLEMEZ", async () => {
    const store = {} as Record<string, Row>;
    const { reserve } = makeSvc(store);

    await expect(reserve("ghost", 1)).rejects.toThrow();
  });

  // #4: releaseReservation — takas iptal/red/dispute'ün kilitli, clamp'li release primitifi.
  it("releaseReservation reservedQuantity'yi FOR UPDATE altında düşürür (2→1)", async () => {
    const store = { p1: row({ quantity: 2, reservedQuantity: 2 }) };
    const { release, queryRawCalls } = makeSvc(store);

    await release("p1", 1);

    expect(store.p1.reservedQuantity).toBe(1);
    expect(queryRawCalls.some((q) => /FOR UPDATE/i.test(q))).toBe(true);
  });

  it("releaseReservation 0'ın altına inmez (clamp)", async () => {
    const store = { p1: row({ quantity: 3, reservedQuantity: 1 }) };
    const { release } = makeSvc(store);

    await release("p1", 3); // safeDecrement(1,3) = 0

    expect(store.p1.reservedQuantity).toBe(0);
  });

  it("release, tam dolu ürünü tekrar rezerve edilebilir yapar (lost-update DEĞİL)", async () => {
    // qty-1 ürün tam rezerve; bir akış release eder → başka akış yeniden rezerve edebilir.
    const store = { p1: row({ quantity: 1, reservedQuantity: 1 }) };
    const { reserve, release } = makeSvc(store);

    // dolu iken reserve reddedilir
    await expect(reserve("p1", 1)).rejects.toThrow();
    // takas iptali release eder
    await release("p1", 1);
    expect(store.p1.reservedQuantity).toBe(0);
    // artık yeniden rezerve edilebilir
    await reserve("p1", 1);
    expect(store.p1.reservedQuantity).toBe(1);
  });
});
