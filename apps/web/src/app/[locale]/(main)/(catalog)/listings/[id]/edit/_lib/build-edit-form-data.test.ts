/** @format */

import { describe, expect, it } from "vitest";
import {
  buildListingFormData,
  buildSaleDataFromListing,
} from "./build-edit-form-data";
import type { ListingEditPayload } from "./types";

/**
 * Düzenleme formu, ürünün GÖSTERİM görünümünden değil `edit` bloğundan (kaydın
 * ham hâli) beslenir. Gösterim yanıtı kampanya fiyatını `price`e katlıyor, kargo
 * paket boyutunu hiç döndürmüyor ve nitelikleri tek etikete düzleştiriyordu:
 * form her kayıtta boyutu `small`a düşürüyor, geçici kampanya da ürünün kalıcı
 * indirimine dönüşüyordu.
 */

const edit = (over: Partial<ListingEditPayload> = {}): ListingEditPayload => ({
  title: "Model Araba",
  description: "Uzun açıklama",
  price: 150,
  oldPrice: null,
  salePrice: null,
  saleStartDate: null,
  saleEndDate: null,
  categoryId: "cat1",
  brandId: "brand1",
  carModelId: "model1",
  manufacturerId: "man1",
  brandSlug: "hot-wheels",
  manufacturerSlug: "mattel",
  carModelName: "Camaro",
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
  releaseDate: "2021-01-01T00:00:00.000Z",
  year: 2021,
  images: [
    {
      cardKey: "c1",
      detailKey: "d1",
      cardUrl: "https://cdn/c1",
      detailUrl: "https://cdn/d1",
      sortOrder: 0,
    },
  ],
  attributes: [
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
    {
      groupSlug: "hw-segment",
      groupName: "Seri",
      slug: "mainline",
      value: "Mainline",
      displayValue: "Mainline",
      manufacturerSlug: "hot-wheels",
    },
  ],
  ...over,
});

describe("buildListingFormData", () => {
  it("formdaki her alanı `edit` bloğundan doldurur", () => {
    const { newFormData } = buildListingFormData(edit());
    expect(newFormData).toEqual({
      title: "Model Araba",
      description: "Uzun açıklama",
      price: "150",
      categoryId: "cat1",
      condition: "very_good",
      brandId: "brand1",
      carModelId: "model1",
      modelCode: "MC-1",
      color: "Kırmızı",
      scale: "1:64",
      material: "diecast",
      manufacturerId: "man1",
      isBoxed: "boxed",
      year: 2021,
      isTradeEnabled: true,
      isSet: true,
      bundleSize: 4,
      quantity: "3",
      shippingPackageTier: "large",
      images: [{ cardKey: "c1", detailKey: "d1" }],
      status: "active",
      customAttributes: { "hw-segment": ["mainline"] },
    });
  });

  it("üreticiye özel nitelikleri gruplarına göre doldurur", () => {
    // Bu bölüm yeni ilan formunda vardı, düzenlemede yoktu: satıcı seçimlerini
    // göremiyor, kaydedince de hepsi siliniyordu.
    const { newFormData } = buildListingFormData(
      edit({
        attributes: [
          {
            groupSlug: "hw-segment",
            groupName: "Seri",
            slug: "mainline",
            value: null,
            displayValue: null,
            manufacturerSlug: "hot-wheels",
          },
          {
            groupSlug: "hw-segment",
            groupName: "Seri",
            slug: "premium",
            value: null,
            displayValue: null,
            manufacturerSlug: "hot-wheels",
          },
          {
            groupSlug: "hw-rarity",
            groupName: "Nadirlik",
            slug: "sth",
            value: null,
            displayValue: null,
            manufacturerSlug: "hot-wheels",
          },
        ],
      }),
    );
    expect(newFormData.customAttributes).toEqual({
      "hw-segment": ["mainline", "premium"],
      "hw-rarity": ["sth"],
    });
  });

  it("global nitelikler (ölçek/malzeme) üretici bölümüne SIZMAZ", () => {
    const { newFormData } = buildListingFormData(
      edit({
        attributes: [
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
            value: null,
            displayValue: null,
            manufacturerSlug: null,
          },
        ],
      }),
    );
    expect(newFormData.customAttributes).toEqual({});
  });

  it("kargo paket boyutunu KAYITTAN alır", () => {
    // Alan gösterim yanıtında hiç dönmüyordu; form her kayıtta 'small' yazıyordu.
    expect(
      buildListingFormData(edit({ shippingPackageTier: "medium" })).newFormData
        .shippingPackageTier,
    ).toBe("medium");
  });

  it("boyut okunamazsa en küçük kademeye düşer", () => {
    expect(
      buildListingFormData(edit({ shippingPackageTier: undefined as never }))
        .newFormData.shippingPackageTier,
    ).toBe("small");
  });

  it("malzemeyi SLUG, ölçeği görünen değer olarak alır", () => {
    // Malzeme seçeneğinin `value`'su slug, ölçeğinki görünen metindir.
    const { newFormData } = buildListingFormData(edit());
    expect(newFormData.material).toBe("diecast");
    expect(newFormData.scale).toBe("1:64");
  });

  it("nitelik grubunu SLUG ile eşler (grup adından bağımsız)", () => {
    const { newFormData } = buildListingFormData(
      edit({
        attributes: [
          {
            groupSlug: "material",
            groupName: "Materyal", // ad değişse de eşleşme bozulmaz
            slug: "resin",
            value: "Resin",
            displayValue: "Resin (Reçine)",
            manufacturerSlug: null,
          },
        ],
      }),
    );
    expect(newFormData.material).toBe("resin");
  });

  it("ölçek displayValue varsa onu tercih eder", () => {
    const { newFormData } = buildListingFormData(
      edit({
        attributes: [
          {
            groupSlug: "scale",
            groupName: "Ölçek",
            slug: "1-18",
            value: "1/18",
            displayValue: "1:18",
            manufacturerSlug: null,
          },
        ],
      }),
    );
    expect(newFormData.scale).toBe("1:18");
  });

  it("kutusuz ürünü doğru işaretler", () => {
    expect(
      buildListingFormData(edit({ isBoxed: false })).newFormData.isBoxed,
    ).toBe("unboxed");
    expect(
      buildListingFormData(edit({ isBoxed: null })).newFormData.isBoxed,
    ).toBe("unboxed");
  });

  it("sınırsız stokta miktar boş kalır (0 ile karışmaz)", () => {
    expect(
      buildListingFormData(edit({ quantity: null })).newFormData.quantity,
    ).toBe("");
    expect(
      buildListingFormData(edit({ quantity: 0 })).newFormData.quantity,
    ).toBe("0");
  });

  it("fiyat alanı ürünün KENDİ fiyatıdır — indirimliyken indirim ÖNCESİ fiyat", () => {
    // Formdaki "Fiyat" satış fiyatı değil, indirim öncesi fiyattır; indirim
    // bölümü indirimli fiyatı ayrıca tutar.
    const { newFormData } = buildListingFormData(
      edit({ price: 80, oldPrice: 100 }),
    );
    expect(newFormData.price).toBe("100");
  });

  it("görsel önizlemeleri sıraya göre döner", () => {
    const { previewUrls } = buildListingFormData(
      edit({
        images: [
          {
            cardKey: "c2",
            detailKey: "d2",
            cardUrl: "https://cdn/c2",
            detailUrl: "https://cdn/d2",
            sortOrder: 1,
          },
          {
            cardKey: "c1",
            detailKey: "d1",
            cardUrl: "https://cdn/c1",
            detailUrl: "https://cdn/d1",
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(previewUrls).toEqual(["https://cdn/c1", "https://cdn/c2"]);
  });

  it("eksik kayıtta forma boş ama geçerli değerler koyar", () => {
    const { newFormData, previewUrls } = buildListingFormData({
      price: null,
    } as ListingEditPayload);
    expect(newFormData.title).toBe("");
    expect(newFormData.price).toBe("");
    expect(newFormData.condition).toBe("very_good");
    expect(newFormData.status).toBe("active");
    expect(newFormData.images).toEqual([]);
    expect(previewUrls).toEqual([]);
  });
});

describe("buildSaleDataFromListing", () => {
  it("indirim yoksa bölüm kapalı gelir", () => {
    const { saleActive, saleData } = buildSaleDataFromListing(edit());
    expect(saleActive).toBe(false);
    expect(saleData.salePrice).toBe("");
  });

  it("ürünün KENDİ indirimini açar", () => {
    const { saleActive, saleData } = buildSaleDataFromListing(
      edit({
        price: 80,
        oldPrice: 100,
        saleStartDate: "2026-08-01T00:00:00.000Z",
        saleEndDate: "2026-08-31T00:00:00.000Z",
      }),
    );
    expect(saleActive).toBe(true);
    expect(saleData.originalPrice).toBe("100");
    expect(saleData.salePrice).toBe("80");
    expect(saleData.saleStartDate).toBe("2026-08-01");
    expect(saleData.saleEndDate).toBe("2026-08-31");
  });

  it("indirim tarihleri boşsa bugünden bir haftalık varsayılan verir", () => {
    const { saleData } = buildSaleDataFromListing(edit());
    expect(saleData.saleStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saleData.saleEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saleData.saleEndDate > saleData.saleStartDate).toBe(true);
  });

  it("eski fiyat indirimli fiyattan küçükse indirim sayılmaz", () => {
    const { saleActive } = buildSaleDataFromListing(
      edit({ price: 100, oldPrice: 80 }),
    );
    expect(saleActive).toBe(false);
  });
});
