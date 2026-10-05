import {
  computeProductContentFingerprint,
  loadProductContentFingerprint,
  stampApprovedContentFingerprint,
  type ProductFingerprintInput,
} from "./product-content-fingerprint";

const base: ProductFingerprintInput = {
  title: "Hot Wheels Camaro",
  description: "Kutusunda, hiç açılmadı",
  categoryId: "cat-1",
  brandId: "brand-1",
  carModelId: null,
  manufacturerId: "man-1",
  modelCode: "HW-1",
  condition: "new",
  images: [
    { cardKey: "c1", detailKey: "d1", sortOrder: 0 },
    { cardKey: "c2", detailKey: "d2", sortOrder: 1 },
  ],
};

describe("computeProductContentFingerprint", () => {
  it("aynı içerik için aynı izi üretir", () => {
    expect(computeProductContentFingerprint(base)).toBe(
      computeProductContentFingerprint({ ...base }),
    );
  });

  it("görsellerin dizi sırasından değil sortOrder'dan etkilenir", () => {
    const reversed = [...base.images!].reverse();
    expect(
      computeProductContentFingerprint({ ...base, images: reversed }),
    ).toBe(computeProductContentFingerprint(base));
  });

  it.each<[string, Partial<ProductFingerprintInput>]>([
    ["başlık", { title: "Başka başlık" }],
    ["açıklama", { description: "Yeni açıklama" }],
    ["kategori", { categoryId: "cat-2" }],
    ["marka", { brandId: "brand-2" }],
    ["üretici", { manufacturerId: "man-2" }],
    ["model kodu", { modelCode: "HW-2" }],
    ["durum", { condition: "used" }],
    [
      "görsel (yeni dosya)",
      { images: [{ cardKey: "c9", detailKey: "d9", sortOrder: 0 }] },
    ],
    [
      "görsel sırası",
      {
        images: [
          { cardKey: "c1", detailKey: "d1", sortOrder: 1 },
          { cardKey: "c2", detailKey: "d2", sortOrder: 0 },
        ],
      },
    ],
    ["görsel kaldırma", { images: [] }],
  ])("%s değişince iz değişir", (_label, patch) => {
    expect(computeProductContentFingerprint({ ...base, ...patch })).not.toBe(
      computeProductContentFingerprint(base),
    );
  });

  it("moderasyona konu olmayan alanlar (fiyat, stok) izi etkilemez", () => {
    const withExtras = {
      ...base,
      price: 999,
      quantity: 7,
    } as ProductFingerprintInput;
    expect(computeProductContentFingerprint(withExtras)).toBe(
      computeProductContentFingerprint(base),
    );
  });

  it("null ve eksik alanı aynı sayar", () => {
    expect(
      computeProductContentFingerprint({ ...base, description: null }),
    ).toBe(
      computeProductContentFingerprint({ ...base, description: undefined }),
    );
  });
});

describe("stampApprovedContentFingerprint", () => {
  const makeDb = (found: ProductFingerprintInput | null) => ({
    product: {
      findUnique: jest.fn().mockResolvedValue(found),
      update: jest.fn().mockResolvedValue({}),
    },
  });

  it("güncel içeriğin izini ilana yazar", async () => {
    const db = makeDb(base);

    await expect(
      stampApprovedContentFingerprint(db as any, "p1"),
    ).resolves.toBe(true);

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        approvedContentFingerprint: computeProductContentFingerprint(base),
      },
    });
  });

  it("ilan yoksa yazmaz", async () => {
    const db = makeDb(null);
    await expect(
      loadProductContentFingerprint(db as any, "p1"),
    ).resolves.toBeNull();
    await expect(
      stampApprovedContentFingerprint(db as any, "p1"),
    ).resolves.toBe(false);
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it("yazım hatası onayı bozmaz: false döner (iz eksik kalır → normal onay kuralı)", async () => {
    const db = makeDb(base);
    db.product.update.mockRejectedValue(new Error("db down"));

    await expect(
      stampApprovedContentFingerprint(db as any, "p1"),
    ).resolves.toBe(false);
  });
});
