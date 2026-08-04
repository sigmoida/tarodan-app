import { buildProductEditProjection } from "./product-edit-projection";

/**
 * Düzenleme formu, ürünün GÖSTERİM görünümünü değil KAYDIN KENDİSİNİ ister:
 * kaydettiğinde aynı değerleri geri yazabilmesi gerekir.
 *
 * Herkese açık ürün yanıtı bir gösterim projeksiyonudur — kampanya fiyatını
 * `price`e katlar, nitelikleri etikete düzleştirir, kargo boyutunu hiç döndürmez.
 * Form o yanıttan beslendiği için boyut her kayıtta `small`a düşüyor, geçici bir
 * kampanya ürünün kalıcı indirimine dönüşüyordu.
 */

const attr = (
  groupSlug: string,
  groupName: string,
  slug: string,
  value: string,
  displayValue?: string,
  manufacturerSlug?: string,
) => ({
  attribute: {
    slug,
    value,
    displayValue: displayValue ?? null,
    group: {
      slug: groupSlug,
      name: groupName,
      manufacturerSlug: manufacturerSlug ?? null,
    },
  },
});

const product = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "Ürün",
  description: "Açıklama",
  price: "150.00",
  oldPrice: null,
  salePrice: null,
  saleStartDate: null,
  saleEndDate: null,
  categoryId: "cat1",
  brandId: "brand1",
  carModelId: "model1",
  manufacturerId: "man1",
  condition: "very_good",
  status: "active",
  modelCode: "MC-1",
  color: "Kırmızı",
  isBoxed: true,
  quantity: 3,
  maxQuantityPerOrder: null,
  shippingPackageTier: "large",
  isTradeEnabled: true,
  isSet: true,
  bundleSize: 4,
  isLimited: false,
  editionNumber: null,
  editionTotal: null,
  releaseDate: new Date("2021-01-01T00:00:00.000Z"),
  images: [
    { cardKey: "c1", detailKey: "d1", sortOrder: 0 },
    { cardKey: "c2", detailKey: "d2", sortOrder: 1 },
  ],
  productAttributes: [
    attr("scale", "Ölçek", "1-64", "1:64"),
    attr("material", "Malzeme", "diecast", "Diecast", "Diecast (Metal)"),
    // Üreticiye özel grup: formun "üretici nitelikleri" bölümüne aittir.
    attr(
      "hw-segment",
      "Seri",
      "mainline",
      "Mainline",
      "Mainline",
      "hot-wheels",
    ),
  ],
  ...over,
});

const imageUrl = (key: string) => `https://cdn/${key}`;

describe("buildProductEditProjection", () => {
  it("kargo paket boyutunu döndürür", () => {
    // Gösterim projeksiyonunda hiç yoktu; form her kayıtta 'small' yazıyordu.
    expect(
      buildProductEditProjection(product(), { imageUrl }).shippingPackageTier,
    ).toBe("large");
  });

  it("fiyatı kampanya UYGULANMADAN döndürür", () => {
    const edit = buildProductEditProjection(product(), { imageUrl });
    expect(edit.price).toBe(150);
    expect(edit.oldPrice).toBeNull();
    expect(edit.salePrice).toBeNull();
  });

  it("ürünün KENDİ indirimini olduğu gibi taşır", () => {
    const edit = buildProductEditProjection(
      product({
        price: "80.00",
        oldPrice: "100.00",
        saleStartDate: new Date("2026-08-01T00:00:00.000Z"),
        saleEndDate: new Date("2026-08-31T00:00:00.000Z"),
      }),
      { imageUrl },
    );
    expect(edit.price).toBe(80);
    expect(edit.oldPrice).toBe(100);
    expect(edit.saleStartDate).toBe("2026-08-01T00:00:00.000Z");
    expect(edit.saleEndDate).toBe("2026-08-31T00:00:00.000Z");
  });

  it("ilişki kimliklerini DÜZ alan olarak verir", () => {
    const edit = buildProductEditProjection(product(), { imageUrl });
    expect(edit.categoryId).toBe("cat1");
    expect(edit.brandId).toBe("brand1");
    expect(edit.carModelId).toBe("model1");
    expect(edit.manufacturerId).toBe("man1");
  });

  it("bağlı listeleri BEKLETMEMEK için marka/üretici slug'ını da verir", () => {
    // Bunlar olmayınca istemci, model listesini çekmek için önce marka
    // listesinin gelip id'den slug'a çevrilmesini bekliyordu (fazladan tam tur).
    const edit = buildProductEditProjection(
      product({
        brand: { id: "brand1", slug: "hot-wheels" },
        manufacturer: { id: "man1", slug: "mattel" },
        carModel: { id: "model1", name: "Camaro" },
      }),
      { imageUrl },
    );
    expect(edit.brandSlug).toBe("hot-wheels");
    expect(edit.manufacturerSlug).toBe("mattel");
    // Model listesi gelene kadar alanın doğru etiketle açılması için.
    expect(edit.carModelName).toBe("Camaro");
  });

  it("ilişki yüklenmemişse slug null kalır", () => {
    const edit = buildProductEditProjection(product(), { imageUrl });
    expect(edit.brandSlug).toBeNull();
    expect(edit.manufacturerSlug).toBeNull();
  });

  it("ilişki kimliği kolonda yoksa ilişkiden çözülür", () => {
    const edit = buildProductEditProjection(
      product({
        categoryId: null,
        brandId: null,
        carModelId: null,
        manufacturerId: null,
        category: { id: "cat9" },
        brand: { id: "brand9" },
        carModel: { id: "model9" },
        manufacturer: { id: "man9" },
      }),
      { imageUrl },
    );
    expect(edit.categoryId).toBe("cat9");
    expect(edit.brandId).toBe("brand9");
    expect(edit.carModelId).toBe("model9");
    expect(edit.manufacturerId).toBe("man9");
  });

  it("nitelikleri hem SLUG hem değeriyle verir", () => {
    // Malzeme seçeneği slug ile, ölçek seçeneği görünen değerle eşleşir;
    // hangisinin kullanılacağına formu bilen taraf karar verir.
    const { attributes } = buildProductEditProjection(product(), { imageUrl });
    expect(attributes.slice(0, 2)).toEqual([
      {
        groupSlug: "scale",
        groupName: "Ölçek",
        slug: "1-64",
        value: "1:64",
        displayValue: null,
        manufacturerSlug: null,
      },
      {
        groupSlug: "material",
        groupName: "Malzeme",
        slug: "diecast",
        value: "Diecast",
        displayValue: "Diecast (Metal)",
        manufacturerSlug: null,
      },
    ]);
  });

  it("üreticiye özel grubu işaretler", () => {
    const { attributes } = buildProductEditProjection(product(), { imageUrl });
    expect(attributes.find((a) => a.groupSlug === "hw-segment")).toMatchObject({
      slug: "mainline",
      manufacturerSlug: "hot-wheels",
    });
    expect(
      attributes
        .filter((a) => a.manufacturerSlug === null)
        .map((a) => a.groupSlug),
    ).toEqual(["scale", "material"]);
  });

  it("grubu olmayan nitelik elenir", () => {
    const { attributes } = buildProductEditProjection(
      product({
        productAttributes: [{ attribute: { slug: "x", value: "y" } }],
      }),
      { imageUrl },
    );
    expect(attributes).toEqual([]);
  });

  it("yılı releaseDate'ten türetir", () => {
    expect(buildProductEditProjection(product(), { imageUrl }).year).toBe(2021);
    expect(
      buildProductEditProjection(product({ releaseDate: null }), { imageUrl })
        .year,
    ).toBeNull();
  });

  it("model yılını TÜRKİYE takviminden okur", () => {
    // Yıl, yerel gece yarısı Ocak 1 olarak yazılır: 1978 için saklanan an
    // 1977-12-31T22:00Z'dir. `getFullYear()` UTC koşan sunucuda 1977 verir ve
    // satıcı formu kaydettiğinde yıl kalıcı olarak bir geri kayardı.
    expect(
      buildProductEditProjection(
        product({ releaseDate: new Date("1977-12-31T22:00:00.000Z") }),
        { imageUrl },
      ).year,
    ).toBe(1978);
  });

  it("görselleri anahtar ve URL'iyle sırasıyla verir", () => {
    const { images } = buildProductEditProjection(product(), { imageUrl });
    expect(images).toEqual([
      {
        cardKey: "c1",
        detailKey: "d1",
        cardUrl: "https://cdn/c1",
        detailUrl: "https://cdn/d1",
        sortOrder: 0,
      },
      {
        cardKey: "c2",
        detailKey: "d2",
        cardUrl: "https://cdn/c2",
        detailUrl: "https://cdn/d2",
        sortOrder: 1,
      },
    ]);
  });

  it("sınırsız stok null kalır (0 ile karışmaz)", () => {
    expect(
      buildProductEditProjection(product({ quantity: null }), { imageUrl })
        .quantity,
    ).toBeNull();
    expect(
      buildProductEditProjection(product({ quantity: 0 }), { imageUrl })
        .quantity,
    ).toBe(0);
  });

  it("formdaki kalan alanları olduğu gibi taşır", () => {
    const edit = buildProductEditProjection(product(), { imageUrl });
    expect(edit).toMatchObject({
      title: "Ürün",
      description: "Açıklama",
      condition: "very_good",
      status: "active",
      modelCode: "MC-1",
      color: "Kırmızı",
      isBoxed: true,
      isTradeEnabled: true,
      isSet: true,
      bundleSize: 4,
    });
  });

  it("boş/eksik kayıtta patlamaz", () => {
    const edit = buildProductEditProjection(
      { id: "p2", price: "10" },
      { imageUrl },
    );
    expect(edit.images).toEqual([]);
    expect(edit.attributes).toEqual([]);
    expect(edit.shippingPackageTier).toBe("small");
    expect(edit.isBoxed).toBeNull();
  });
});
