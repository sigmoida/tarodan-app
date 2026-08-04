export interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export interface CarModel {
  id: string;
  name: string;
  slug: string;
  brand: {
    slug: string;
  };
}

/** `/products/my/:id` yanıtındaki `edit` bloğu — ürün kaydının ham hâli. */
export interface ListingEditAttribute {
  groupSlug: string;
  groupName: string | null;
  /** Seçenek listesinde `value` olarak kullanılan slug (ör. malzeme). */
  slug: string;
  value: string | null;
  /** Kullanıcıya görünen değer (ör. ölçek "1:64"). */
  displayValue: string | null;
  /** Grup üreticiye özelse üreticinin slug'ı; global gruplarda null. */
  manufacturerSlug: string | null;
}

export interface ListingEditImage {
  cardKey: string;
  detailKey: string;
  cardUrl: string;
  detailUrl: string;
  sortOrder: number;
}

/**
 * Formu TEK BAŞINA dolduran kayıt. Gösterim yanıtından ayrıdır: fiyatlar
 * kampanya uygulanmadan, kargo boyutu ve ilişki kimlikleri düz alan olarak,
 * nitelikler hem slug hem değeriyle gelir.
 */
export interface ListingEditPayload {
  title: string | null;
  description: string | null;
  price: number | null;
  oldPrice: number | null;
  salePrice: number | null;
  saleStartDate: string | null;
  saleEndDate: string | null;
  categoryId: string | null;
  brandId: string | null;
  carModelId: string | null;
  manufacturerId: string | null;
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
  images: ListingEditImage[];
  attributes: ListingEditAttribute[];
}

export interface EditListingFormData {
  title: string;
  description: string;
  price: string;
  categoryId: string;
  condition: string;
  brandId: string;
  carModelId: string;
  modelCode: string;
  color: string;
  scale: string;
  material: string;
  manufacturerId: string;
  isBoxed: "boxed" | "unboxed";
  year: string | number;
  isTradeEnabled: boolean;
  isSet: boolean;
  bundleSize: number | undefined;
  quantity: string | number;
  shippingPackageTier: "small" | "medium" | "large";
  images: Array<{ cardKey: string; detailKey: string }>;
  status: string;
  /** Üreticiye özel nitelik seçimleri: { grupSlug: [nitelikSlug] }. */
  customAttributes: Record<string, string[]>;
}
