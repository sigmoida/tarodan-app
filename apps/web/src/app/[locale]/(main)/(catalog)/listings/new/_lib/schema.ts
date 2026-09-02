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
} from "@tarodan/listing-form";

/**
 * New-listing form schema — shared base fields plus new-only extras (at least
 * three photos, custom attribute groups). Locale-aware messages. Required
 * global custom groups come from a getter because the group list is fetched
 * after the form is created (see `RequiredGroupSlugsSource`).
 */
export const newListingSchema = (
  locale: string,
  getRequiredGroupSlugs: RequiredGroupSlugsSource = () => [],
) => {
  const msg = listingFieldMessages(locale);
  return z
    .object({
      ...baseListingFields(msg),
      images: z.array(listingImageSchema).min(3, msg.photo),
      customAttributes: customAttributesField,
    })
    .superRefine(bundleSizeRefine(msg.setSize))
    .superRefine(colorsRefine(msg.required))
    .superRefine(
      requiredAttributeGroupsRefine(getRequiredGroupSlugs, msg.required),
    );
};

export type NewListingValues = z.infer<ReturnType<typeof newListingSchema>>;

/** Seed values for `useZodForm({ defaultValues })`. */
export const emptyListingValues: NewListingValues = {
  ...emptyBaseListingValues,
  quantity: "1",
  images: [],
  customAttributes: {},
};
