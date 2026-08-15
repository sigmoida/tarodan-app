/** @format */

import type { ProductImage } from "./types";
import { imagePlaceholder } from "@/lib/placeholder";

export const PLACEHOLDER = imagePlaceholder("600x600");

/** Prefer the high-res detail URL (gallery / lightbox). */
export function getDetailImageUrl(image: ProductImage | string): string {
  if (typeof image === "string") return image || PLACEHOLDER;
  return image?.detailUrl ?? image?.cardUrl ?? image?.url ?? PLACEHOLDER;
}

/** Prefer the smaller card URL (cart thumbnail, offline cart). */
export function getCardImageUrl(image: ProductImage | string): string {
  if (typeof image === "string") return image || PLACEHOLDER;
  return image?.cardUrl ?? image?.detailUrl ?? image?.url ?? PLACEHOLDER;
}

/** The detail-URL image list used across gallery / lightbox / 360°. */
export function buildImages(images?: Array<ProductImage | string>): string[] {
  return images?.length ? images.map(getDetailImageUrl) : [PLACEHOLDER];
}
