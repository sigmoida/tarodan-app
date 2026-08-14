/** @format */

import { z } from "zod";
import {
  baseListingFields,
  bundleSizeRefine,
  colorsRefine,
  emptyBaseListingValues,
  listingFieldMessages,
  listingImageSchema,
} from "@/components/listings/form/schema";

/**
 * New-listing form schema — shared base fields plus new-only extras (at least one
 * photo required, manufacturer custom attributes). Locale-aware messages.
 */
export const newListingSchema = (locale: string) => {
  const msg = listingFieldMessages(locale);
  return z
    .object({
      ...baseListingFields(msg),
      images: z.array(listingImageSchema).min(3, msg.photo),
      customAttributes: z.record(z.string(), z.array(z.string())),
    })
    .superRefine(bundleSizeRefine(msg.setSize))
    .superRefine(colorsRefine(msg.required));
};

export type NewListingValues = z.infer<ReturnType<typeof newListingSchema>>;

/** Seed values for `useZodForm({ defaultValues })`. */
export const emptyListingValues: NewListingValues = {
  ...emptyBaseListingValues,
  quantity: "1",
  images: [],
  customAttributes: {},
};
