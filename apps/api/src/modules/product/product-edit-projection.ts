import { trCalendarYear } from "../../common/helpers/tr-calendar";

/**
 * Ürünün DÜZENLEME projeksiyonu — kaydın kendisi, gösterim görünümü değil.
 *
 * Herkese açık ürün yanıtı (`buildProductResponse`) bir GÖSTERİM projeksiyonudur:
 * kampanya fiyatını `price`e katlar, nitelikleri tek bir etikete düzleştirir,
 * satıcı istatistiği/puan ekler ve kargo paket boyutunu hiç döndürmez.
 *
 * Düzenleme formunun ihtiyacı bunun tam tersi: kaydettiğinde AYNI değerleri geri
 * yazabilmesi için kolonların ham hâli. İkisi tek şekle bindirildiğinde form her
 * kayıtta kargo boyutunu `small`a düşürüyor, geçici bir kampanya indirimi de
 * ürünün kalıcı indirimine dönüşüyordu.
 *
 * Blok, formu TEK BAŞINA doldurabilecek kadar eksiksizdir: eşleme tarafının
 * gösterim alanlarına geri düşmesi gerekmez.
 *
 * Saf fonksiyondur; görsel URL'i çözücü dışarıdan verilir (storage servisine
 * bağlanmadan test edilebilsin diye).
 */

export interface ProductEditAttribute {
  groupSlug: string;
  groupName: string | null;
  /** Seçenek listelerinde `value` olarak kullanılan slug (ör. malzeme). */
  slug: string;
  value: string | null;
  /** Kullanıcıya görünen değer (ör. ölçek "1:64"). */
  displayValue: string | null;
  /**
   * Grup üreticiye özel ise üreticinin slug'ı, değilse null. Formun "üretici
   * nitelikleri" bölümü YALNIZ bunları yönetir; ölçek/malzeme gibi global
   * gruplar kendi alanlarına aittir.
   */
  manufacturerSlug: string | null;
}

export interface ProductEditImage {
  cardKey: string;
  detailKey: string;
  cardUrl: string;
  detailUrl: string;
  sortOrder: number;
}

export interface ProductEditProjection {
  title: string | null;
  description: string | null;
  /** Kampanya UYGULANMAMIŞ satış fiyatı. */
  price: number | null;
  /** Ürünün KENDİ indiriminden önceki fiyatı (çizili). */
  oldPrice: number | null;
  salePrice: number | null;
  saleStartDate: string | null;
  saleEndDate: string | null;
  categoryId: string | null;
  brandId: string | null;
  carModelId: string | null;
  manufacturerId: string | null;
  categoryName: string | null;
  brandName: string | null;
  manufacturerName: string | null;
  /**
   * Markanın ve üreticinin slug'ı.
   *
   * Bunlara bağlı listeler (araç modelleri, üreticiye özel nitelikler) slug ile
   * çekiliyor. Slug kayıtta dönmeyince istemci önce marka listesinin gelmesini
   * bekleyip id'den slug'a çevirmek zorunda kalıyordu: model seçimi ilanın bir
   * TAM tur ardından doluyor, form geç akıyormuş gibi görünüyordu.
   */
  brandSlug: string | null;
  manufacturerSlug: string | null;
  /**
   * Ürünün araç modelinin adı.
   *
   * Model listesi markaya bağlı ayrı bir istekle gelir; form açıldığında o liste
   * henüz yoktur ve seçim boş görünür. Ad kayıtla birlikte geldiğinde alan
   * doğru etiketle AÇILIR, liste arkadan tamamlanır.
   */
  carModelName: string | null;
  condition: string | null;
  status: string | null;
  modelCode: string | null;
  color: string | null;
  isBoxed: boolean | null;
  /** null = sınırsız stok (0 ile karıştırılmamalı). */
  quantity: number | null;
  maxQuantityPerOrder: number | null;
  shippingPackageTier: string;
  isTradeEnabled: boolean;
  isSet: boolean;
  bundleSize: number | null;
  isLimited: boolean;
  editionNumber: string | null;
  editionTotal: number | null;
  releaseDate: string | null;
  year: number | null;
  images: ProductEditImage[];
  attributes: ProductEditAttribute[];
}

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function buildProductEditProjection(
  product: any,
  deps: { imageUrl: (key: string) => string },
): ProductEditProjection {
  const releaseDate = product.releaseDate
    ? new Date(product.releaseDate)
    : null;

  return {
    title: product.title ?? null,
    description: product.description ?? null,
    price: num(product.price),
    oldPrice: num(product.oldPrice),
    salePrice: num(product.salePrice),
    saleStartDate: iso(product.saleStartDate),
    saleEndDate: iso(product.saleEndDate),
    // Kolon boşsa ilişkiden çözülür: bazı sorgular yalnız ilişkiyi include eder.
    categoryId: product.categoryId ?? product.category?.id ?? null,
    brandId: product.brandId ?? product.brand?.id ?? null,
    carModelId: product.carModelId ?? product.carModel?.id ?? null,
    manufacturerId: product.manufacturerId ?? product.manufacturer?.id ?? null,
    categoryName: product.category?.name ?? null,
    brandName: product.brand?.name ?? null,
    manufacturerName: product.manufacturer?.name ?? null,
    brandSlug: product.brand?.slug ?? null,
    manufacturerSlug: product.manufacturer?.slug ?? null,
    carModelName: product.carModel?.name ?? null,
    condition: product.condition ?? null,
    status: product.status ?? null,
    modelCode: product.modelCode ?? null,
    color: product.color ?? null,
    isBoxed: product.isBoxed ?? null,
    quantity: product.quantity ?? null,
    maxQuantityPerOrder: product.maxQuantityPerOrder ?? null,
    // Boyut, siparişin kargo ücretini belirler; okunamıyorsa create yolunun
    // varsayılanı ile aynı kademe kullanılır.
    shippingPackageTier: product.shippingPackageTier ?? "small",
    isTradeEnabled: product.isTradeEnabled ?? false,
    isSet: product.isSet ?? false,
    bundleSize: product.bundleSize ?? null,
    isLimited: product.isLimited ?? false,
    editionNumber: product.editionNumber ?? null,
    editionTotal: product.editionTotal ?? null,
    releaseDate: iso(product.releaseDate),
    // Model yılı TÜRKİYE takviminden okunur. Yıl yerel gece yarısı Ocak 1
    // olarak yazılıyor (1978 → 1977-12-31T22:00Z); `getFullYear()` UTC koşan
    // sunucuda bir yıl geri veriyor ve kayıtta yıl kalıcı olarak kayıyordu.
    year: releaseDate ? trCalendarYear(releaseDate) : null,
    images: (product.images ?? []).map((img: any) => ({
      cardKey: img.cardKey,
      detailKey: img.detailKey,
      cardUrl: deps.imageUrl(img.cardKey),
      detailUrl: deps.imageUrl(img.detailKey),
      sortOrder: img.sortOrder ?? 0,
    })),
    // Nitelik hem SLUG hem değeriyle taşınır: malzeme seçeneği slug ile, ölçek
    // seçeneği görünen değerle eşleşir — hangisinin kullanılacağına formun
    // seçenek listesini bilen taraf karar verir.
    attributes: (product.productAttributes ?? [])
      .filter((pa: any) => pa?.attribute?.group)
      .map((pa: any) => ({
        groupSlug: pa.attribute.group.slug,
        groupName: pa.attribute.group.name ?? null,
        slug: pa.attribute.slug,
        value: pa.attribute.value ?? null,
        displayValue: pa.attribute.displayValue ?? null,
        manufacturerSlug: pa.attribute.group.manufacturerSlug ?? null,
      })),
  };
}
