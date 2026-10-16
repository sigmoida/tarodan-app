/** @format */

import { z } from "zod";
import {
  baseListingFields,
  bundleSizeRefine,
  colorsRefine,
  customAttributesField,
  emptyBaseListingValues,
  listingFieldMessages,
  listingImageSchema,
  requiredAttributeGroupsRefine,
  type RequiredGroupSlugsSource,
} from "../form/schema";
import {
  NO_PRICE_LIMITS,
  priceLimitMessages,
  priceLimitsRefine,
  type PriceRulesSource,
} from "../form/price-limits";

/**
 * Edit-listing form schema — shared base fields plus edit-only extras (preorder,
 * status, images optional). Turkish messages to match the original flow.
 */
const msg = listingFieldMessages("tr");
const priceMsg = priceLimitMessages("tr");

export const editListingSchema = z
  .object({
    ...baseListingFields(msg),
    isPreorder: z.boolean(),
    images: z.array(listingImageSchema),
    status: z.string(),
    // Özel grup seçimleri (genel + üreticiye bağlı) — yeni ilan formunda da var.
    customAttributes: customAttributesField,
  })
  .superRefine(bundleSizeRefine(msg.setSize))
  .superRefine(colorsRefine(msg.required));

export type EditListingValues = z.infer<typeof editListingSchema>;

/**
 * Düzenleme şeması + zorunlu genel özel gruplar (+ satıcı ekranında platform
 * fiyat sınırı). Gruplar ve sınırlar sorgudan geldiği için getter alır (bkz.
 * `RequiredGroupSlugsSource`, `PriceRulesSource`); `editListingSchema` tip ve
 * varsayılanlar için olduğu gibi kalır.
 */
export const buildEditListingSchema = (
  getRequiredGroupSlugs: RequiredGroupSlugsSource,
  // Fiyat sınırı yalnız satıcı ekranında verilir; yönetici düzenlemesi muaftır
  // (varsayılan: sınır yok).
  getPriceRules: PriceRulesSource = () => ({ limits: NO_PRICE_LIMITS }),
) =>
  editListingSchema
    .superRefine(
      requiredAttributeGroupsRefine(getRequiredGroupSlugs, msg.required),
    )
    .superRefine(priceLimitsRefine(getPriceRules, priceMsg));

/** Seed values for `useZodForm({ defaultValues })`. */
export const emptyEditValues: EditListingValues = {
  ...emptyBaseListingValues,
  isPreorder: false,
  images: [],
  status: "active",
  customAttributes: {},
};
