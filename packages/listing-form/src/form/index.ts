/** @format */

// Shared listing-form module — constants, catalog queries, schema base, the
// image-upload hook, and the presentational cards used by both new & edit.

export * from "./constants";
export * from "./queries";
export * from "./schema";
export * from "./attribute-groups";
export * from "./cards/option-text";
export {
  useListingImageUpload,
  type ListingImage,
} from "./useListingImageUpload";

export { default as TitleDescriptionCard } from "./cards/TitleDescriptionCard";
export { default as ProductDetailsCard } from "./cards/ProductDetailsCard";
export { default as OptionsCard } from "./cards/OptionsCard";
export { default as PricingCard } from "./cards/PricingCard";
export { default as ImagesCard } from "./cards/ImagesCard";
export { default as DiscountCard, type SaleData } from "./cards/DiscountCard";
export * from "./sale-data";
export { default as ManufacturerAttributesCard } from "./cards/ManufacturerAttributesCard";
export { default as GlobalAttributesCard } from "./cards/GlobalAttributesCard";

// Sunucuya açılan tek kapı — uygulamalar kendi istemcilerini buradan verir.
export {
  ListingFormApiProvider,
  useListingFormApi,
  type ListingFormApi,
} from "./api-context";
export { default as ImagePreviewGrid } from "./ImagePreviewGrid";
export type { ImagePreviewGridProps } from "./ImagePreviewGrid";
export { default as ListingImageDropzone } from "./cards/ListingImageDropzone";
export {
  usePackageTiers,
  type PackageTier,
  type PackageTierCode,
} from "./usePackageTiers";
export * from "./listing-image-item";
export { canRotateFile, rotateImageFile } from "./rotate-image";
export type { Translate } from "./translate";
