/** @format */

import { z } from "zod";
import { imagePlaceholder } from "@/lib/placeholder";
import type { Translate } from "@/types/i18n";

export const PRODUCT_PLACEHOLDER = imagePlaceholder(
  "80x80",
  "374151",
  "9ca3af",
);

/** The API limits of a custom item (`apps/api` `AddCollectionItemDto`). */
export const CUSTOM_ITEM_LIMITS = {
  titleMax: 200,
  descriptionMax: 1000,
  yearMin: 1900,
  yearMax: 2100,
} as const;

const L = CUSTOM_ITEM_LIMITS;

/** Custom (non-listing) collection item — RHF/zod form. `year` stays a string
 *  (native input) and is coerced in the mutation; it is empty or a whole year
 *  in the API range. `imageUrl` holds the uploaded URL (via FormImageUpload).
 *  Only the title is required. */
export const customItemSchema = (t: Translate) =>
  z.object({
    title: z
      .string()
      .trim()
      .min(1, t("validation.required"))
      .max(L.titleMax, t("validation.maxLength", { max: L.titleMax })),
    description: z
      .string()
      .trim()
      .max(
        L.descriptionMax,
        t("validation.maxLength", { max: L.descriptionMax }),
      )
      .optional(),
    brand: z.string().optional(),
    model: z.string().optional(),
    year: z
      .string()
      .trim()
      .optional()
      .superRefine((value, ctx) => {
        if (!value) return;
        const year = Number(value);
        const message = !Number.isInteger(year)
          ? t("validation.enterValidValue")
          : year < L.yearMin
            ? t("validation.minValue", { min: L.yearMin })
            : year > L.yearMax
              ? t("validation.maxValue", { max: L.yearMax })
              : null;
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }),
    scale: z.string().optional(),
    manufacturer: z.string().optional(),
    material: z.string().optional(),
    imageUrl: z.string().optional(),
  });

export type CustomItemForm = z.infer<ReturnType<typeof customItemSchema>>;

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
