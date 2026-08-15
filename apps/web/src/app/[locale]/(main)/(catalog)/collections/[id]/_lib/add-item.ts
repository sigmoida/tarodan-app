/** @format */

import { z } from "zod";
import { imagePlaceholder } from "@/lib/placeholder";

export const PRODUCT_PLACEHOLDER = imagePlaceholder(
  "80x80",
  "374151",
  "9ca3af",
);

/** Custom (non-listing) collection item — RHF/zod form. `year` stays a string
 *  (native input) and is coerced in the mutation; `imageUrl` holds the uploaded
 *  URL (via FormImageUpload). Only the title is required. */
export const customItemSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.string().optional(),
  scale: z.string().optional(),
  manufacturer: z.string().optional(),
  material: z.string().optional(),
  imageUrl: z.string().optional(),
});

export type CustomItemForm = z.infer<typeof customItemSchema>;

export const EMPTY_CUSTOM_ITEM: CustomItemForm = {
  title: "",
  description: "",
  brand: "",
  model: "",
  year: "",
  scale: "",
  manufacturer: "",
  material: "",
  imageUrl: "",
};
