/** @format */

import { z } from "zod";
import {
  baseListingFields,
  bundleSizeRefine,
  colorsRefine,
  emptyBaseListingValues,
  listingFieldMessages,
  listingImageSchema,
} from "../form/schema";

/**
 * Edit-listing form schema — shared base fields plus edit-only extras (preorder,
 * status, images optional). Turkish messages to match the original flow.
 */
const msg = listingFieldMessages("tr");

export const editListingSchema = z
  .object({
    ...baseListingFields(msg),
    isPreorder: z.boolean(),
    images: z.array(listingImageSchema),
    status: z.string(),
    // Üreticiye özel nitelikler — yeni ilan formunda da var.
    customAttributes: z.record(z.string(), z.array(z.string())),
  })
  .superRefine(bundleSizeRefine(msg.setSize))
  .superRefine(colorsRefine(msg.required));

export type EditListingValues = z.infer<typeof editListingSchema>;

/** Seed values for `useZodForm({ defaultValues })`. */
export const emptyEditValues: EditListingValues = {
  ...emptyBaseListingValues,
  isPreorder: false,
  images: [],
  status: "active",
  customAttributes: {},
};
