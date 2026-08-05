/** @format */

import type { SaleData } from "@/components/listings/form";
import type {
  EditListingFormData,
  ListingEditAttribute,
  ListingEditPayload,
} from "./types";

/**
 * Kaydı düzenleme formunun şekline çeviren SAF eşleme.
 *
 * Kaynak, `/products/my/:id` yanıtındaki `edit` bloğudur — yani kaydın ham hâli.
 * Eskiden gösterim yanıtı okunuyordu ve bu üç şeyi bozuyordu:
 *
 *  - kargo paket boyutu o yanıtta hiç dönmediği için her kayıtta `small`a düşüyordu,
 *  - kampanya fiyatı `price`e katlandığı için geçici indirim, ürünün kalıcı
 *    indirimi olarak forma doluyor ve kaydedilince kalıcılaşıyordu,
 *  - malzeme etiketi (ör. "Diecast (Metal)") seçeneklerin `value`su olan slug ile
 *    eşleşmediği için zorunlu alan boş açılıyordu.
 *
 * Önceki form değerine geri düşen ("prev") yedekler bilerek kaldırıldı: kayıt tek
 * kaynaktır, yedek eski/başka bir ilanın değerini sızdırma riski taşıyordu.
 */

const text = (value: string | null | undefined): string => value ?? "";

/** Sıra numarasına göre görseller — API sırası garanti değil. */
const bySortOrder = <T extends { sortOrder: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder);

const attributeOf = (
  attributes: ListingEditAttribute[] | undefined,
  groupSlug: string,
): ListingEditAttribute | undefined =>
  (attributes ?? []).find((a) => a.groupSlug === groupSlug);

/**
 * Üreticiye özel nitelik seçimleri: `{ grupSlug: [nitelikSlug] }`.
 *
 * Yalnız üreticiye BAĞLI gruplar alınır; ölçek ve malzeme gibi global grupların
 * kendi form alanları vardır ve bu bölüme sızmamalıdır.
 */
function customAttributesOf(
  attributes: ListingEditAttribute[] | undefined,
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const attribute of attributes ?? []) {
    if (!attribute.manufacturerSlug) continue;
    (grouped[attribute.groupSlug] ??= []).push(attribute.slug);
  }
  return grouped;
}

const SHIPPING_TIERS = ["small", "medium", "large"] as const;
type ShippingTier = (typeof SHIPPING_TIERS)[number];

const shippingTierOf = (value: string | null | undefined): ShippingTier =>
  SHIPPING_TIERS.includes(value as ShippingTier)
    ? (value as ShippingTier)
    : "small";

export function buildListingFormData(edit: ListingEditPayload): {
  newFormData: EditListingFormData;
  previewUrls: string[];
} {
  // Formdaki "Fiyat" indirim ÖNCESİ fiyattır; indirimli fiyatı indirim bölümü
  // ayrıca tutar. İndirim yoksa ikisi de ürünün fiyatıdır.
  const hasOwnSale =
    edit.oldPrice != null && edit.price != null && edit.oldPrice > edit.price;
  const basePrice = hasOwnSale ? edit.oldPrice : edit.price;

  const images = bySortOrder(edit.images ?? []);
  const scale = attributeOf(edit.attributes, "scale");
  const material = attributeOf(edit.attributes, "material");

  const newFormData: EditListingFormData = {
    title: text(edit.title),
    description: text(edit.description),
    price: basePrice != null ? String(basePrice) : "",
    categoryId: text(edit.categoryId),
    condition: edit.condition || "very_good",
    brandId: text(edit.brandId),
    carModelId: text(edit.carModelId),
    modelCode: text(edit.modelCode),
    color: text(edit.color),
    // Ölçek seçeneğinin `value`su GÖRÜNEN metindir, malzeme seçeneğininki SLUG.
    scale: text(scale?.displayValue || scale?.value),
    material: text(material?.slug),
    manufacturerId: text(edit.manufacturerId),
    isBoxed: edit.isBoxed === true ? "boxed" : "unboxed",
    year: edit.year ?? "",
    isTradeEnabled: edit.isTradeEnabled ?? false,
    isSet: edit.isSet ?? false,
    bundleSize: edit.bundleSize ?? undefined,
    // null = sınırsız stok → alan boş kalır; 0 gerçek bir değerdir.
    quantity: edit.quantity != null ? String(edit.quantity) : "",
    shippingPackageTier: shippingTierOf(edit.shippingPackageTier),
    images: images.map((img) => ({
      cardKey: img.cardKey,
      detailKey: img.detailKey,
    })),
    status: edit.status || "active",
    customAttributes: customAttributesOf(edit.attributes),
  };

  const previewUrls = images.map((img) => img.cardUrl ?? img.detailUrl);

  return { newFormData, previewUrls };
}

/** yyyy-mm-dd (ISO tarihinin gün kısmı). */
const dayOf = (value: string | null | undefined): string | null =>
  value ? value.split("T")[0] : null;

const today = (): string => new Date().toISOString().split("T")[0];
const inAWeek = (): string =>
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

/**
 * İndirim bölümünün başlangıç durumu — yalnız ürünün KENDİ indirimi.
 *
 * Kampanya indirimleri (satıcı/kategori/global) buraya girmez: gösterim
 * yanıtında kampanya fiyatı `price`e katlandığı için form onu ürünün indirimi
 * sanıyor ve kaydedince kampanyayı kalıcı indirime çeviriyordu.
 */
export function buildSaleDataFromListing(edit: ListingEditPayload): {
  saleData: SaleData;
  saleActive: boolean;
} {
  const original = edit.oldPrice;
  const sale = edit.price;
  const saleActive =
    original != null && sale != null && sale > 0 && original > sale;

  return {
    saleData: {
      originalPrice: original != null ? String(original) : "",
      salePrice: saleActive ? String(sale) : "",
      saleStartDate: dayOf(edit.saleStartDate) ?? today(),
      saleEndDate: dayOf(edit.saleEndDate) ?? inAWeek(),
    },
    saleActive,
  };
}
