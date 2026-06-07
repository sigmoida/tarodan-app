import { z } from 'zod';

/**
 * Listing attribute selection.
 *
 * Shape: groupSlug -> selected attribute slugs.
 * Example:
 *   {
 *     "hw-segment": ["mattel-creations"],
 *     "hw-rarity": ["treasure-hunt"],
 *     "hw-body-color": ["red"]
 *   }
 *
 * Empty groups are allowed (user did not pick anything for that group).
 */
export const attributeSelectionSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1)).default([]),
);
export type AttributeSelection = z.infer<typeof attributeSelectionSchema>;

/**
 * Compile-time list of Hot Wheels-scoped attribute group slugs.
 *
 * Source of truth lives in DB (AttributeGroup.manufacturerSlug = 'hot-wheels'),
 * but having a compile-time list here lets TS catch typos in form code and
 * lets the validator reject keys outside this set when manufacturer is HW.
 *
 * If the DB list ever changes, update this constant.
 */
export const HW_ATTRIBUTE_GROUP_SLUGS = [
  'hw-segment',
  'hw-assortment',
  'hw-body-color',
  'hw-color-finishes',
  'hw-rarity',
  'hw-designer',
  'hw-wheel-type',
] as const;

export type HwAttributeGroupSlug = (typeof HW_ATTRIBUTE_GROUP_SLUGS)[number];

/**
 * HW attribute selection — keys constrained to HW group slugs.
 * All groups optional (user may pick zero or many).
 */
export const hwAttributesSchema = z
  .object(
    HW_ATTRIBUTE_GROUP_SLUGS.reduce<Record<string, z.ZodType<string[]>>>(
      (acc, slug) => {
        acc[slug] = z.array(z.string().min(1)).default([]);
        return acc;
      },
      {},
    ),
  )
  .partial();
export type HwAttributes = z.infer<typeof hwAttributesSchema>;

/**
 * Manufacturer-aware listing extras.
 *
 * - If manufacturerSlug is 'hot-wheels', `attributes` MUST use HW group keys.
 * - Otherwise, `attributes` is an unconstrained generic AttributeSelection.
 *
 * Uses `z.union` rather than `discriminatedUnion` because zod cannot extract a
 * discriminator from a generic `z.string()`. Order matters: the HW variant must
 * come first so the literal match takes precedence over the catch-all string.
 *
 * Forms (web/mobile) merge this with their existing per-app listing schema:
 *   const formSchema = baseListingSchema.extend({ extras: listingExtrasSchema });
 */
export const listingExtrasSchema = z.union([
  z.object({
    manufacturerSlug: z.literal('hot-wheels'),
    attributes: hwAttributesSchema,
  }),
  z.object({
    manufacturerSlug: z.string().min(1),
    attributes: attributeSelectionSchema.optional(),
  }),
]);
export type ListingExtras = z.infer<typeof listingExtrasSchema>;

/**
 * Helper: flatten a HwAttributes object into the flat ProductAttribute payload
 * the API expects (array of attribute slugs). Order: group order, then in-group.
 */
export function flattenHwAttributes(input: HwAttributes): string[] {
  const out: string[] = [];
  for (const group of HW_ATTRIBUTE_GROUP_SLUGS) {
    const selected = input[group];
    if (selected && selected.length > 0) out.push(...selected);
  }
  return out;
}
