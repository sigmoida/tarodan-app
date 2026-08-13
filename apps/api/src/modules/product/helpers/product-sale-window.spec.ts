import { boostTierBasePrice, resolveSalePrice } from "./product-sale-window";

/**
 * İndirim penceresi TAHSİLATI da bağlar.
 *
 * A + oldPrice modelinde `price` her zaman güncel satış fiyatıdır ve satıcı
 * indirimi kaydettiği anda indirimli değere yazılır. `saleStartDate` /
 * `saleEndDate` ise yalnız gösterimi etkiliyordu: pencere kapandığında çizili
 * fiyat ile rozet kayboluyor ama ürün indirimli fiyattan satılmaya DEVAM
 * ediyordu; pencere açılmadan önce de indirim çoktan geçerliydi. Fiyatı geri
 * alan bir iş yok — tek dönüş yolu satıcının ilanı elle güncellemesi.
 */
describe("indirim penceresi", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const onSale = {
    price: 70,
    oldPrice: 100,
    saleStartDate: "2026-08-01T00:00:00.000Z",
    saleEndDate: "2026-08-31T00:00:00.000Z",
  };

  it("pencere içindeyken indirimli fiyat geçerlidir", () => {
    expect(resolveSalePrice(onSale, now)).toEqual({
      price: 70,
      oldPrice: 100,
      isOnSale: true,
    });
  });

  it("pencere BİTTİKTEN sonra indirim öncesi fiyata döner", () => {
    // Eskiden 70'ten satılmaya devam ediyor, yalnız çizili fiyat kayboluyordu.
    expect(
      resolveSalePrice(onSale, new Date("2026-09-01T00:00:01.000Z")),
    ).toEqual({ price: 100, oldPrice: null, isOnSale: false });
  });

  it("pencere BAŞLAMADAN önce indirim geçerli değildir", () => {
    expect(
      resolveSalePrice(onSale, new Date("2026-07-31T23:59:59.000Z")),
    ).toEqual({ price: 100, oldPrice: null, isOnSale: false });
  });

  it("tarihsiz indirim süresizdir", () => {
    expect(resolveSalePrice({ price: 70, oldPrice: 100 }, now)).toEqual({
      price: 70,
      oldPrice: 100,
      isOnSale: true,
    });
  });

  it("yalnız bitiş tarihi verilebilir", () => {
    const untilEnd = { price: 70, oldPrice: 100, saleEndDate: "2026-08-31" };
    expect(resolveSalePrice(untilEnd, now).isOnSale).toBe(true);
    expect(resolveSalePrice(untilEnd, new Date("2026-10-01")).price).toBe(100);
  });

  it("indirim yoksa fiyat aynen kalır", () => {
    expect(resolveSalePrice({ price: 70, oldPrice: null }, now)).toEqual({
      price: 70,
      oldPrice: null,
      isOnSale: false,
    });
  });

  it("indirim öncesi fiyat düşükse indirim sayılmaz", () => {
    // Bozuk veri: çizili fiyat satış fiyatından küçük. Satış fiyatı korunur.
    expect(resolveSalePrice({ price: 100, oldPrice: 80 }, now)).toEqual({
      price: 100,
      oldPrice: null,
      isOnSale: false,
    });
  });

  it("Prisma Decimal (string) değerleri çözülür", () => {
    expect(
      resolveSalePrice({ price: "70.50", oldPrice: "100.00" }, now),
    ).toEqual({ price: 70.5, oldPrice: 100, isOnSale: true });
  });

  it("geçersiz tarih pencereyi kapatmaz", () => {
    expect(
      resolveSalePrice({ price: 70, oldPrice: 100, saleEndDate: "bozuk" }, now)
        .isOnSale,
    ).toBe(true);
  });
});

/**
 * Boost kademe tabanı LİSTE fiyatıdır — resolveSalePrice'tan bilinçli bağımsız.
 * İndirim penceresi açıkken bile kademe indirim ÖNCESİ fiyattan eşleşir:
 * satıcı indirim açarak daha ucuz boost kademesine kayamaz.
 */
describe("boostTierBasePrice", () => {
  it("indirimli üründe liste (oldPrice) fiyatını döner — pencere açık olsa bile", () => {
    expect(boostTierBasePrice({ price: 1920, oldPrice: 2400 })).toBe(2400);
  });

  it("indirimsiz üründe price zaten liste fiyatıdır", () => {
    expect(boostTierBasePrice({ price: 2400, oldPrice: null })).toBe(2400);
  });

  it("bozuk veri (oldPrice <= price) liste fiyatı sayılmaz", () => {
    expect(boostTierBasePrice({ price: 2400, oldPrice: 1000 })).toBe(2400);
  });
});
