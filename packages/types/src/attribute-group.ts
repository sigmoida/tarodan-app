/**
 * Attribute group rules — the single source of truth shared by the API
 * (filter generation, where building, product write path), the listing form
 * package (web + admin forms) and the admin catalog screens.
 *
 * Group slugs used to be duplicated in `apps/api/src/common/helpers/
 * attribute-groups.ts` and `packages/listing-form/src/form/constants.ts`; both
 * still export them, but from here. Lives in `@tarodan/types` for the same
 * reason as the phone rules: the API imports it at runtime and the Dockerfile
 * builds and copies this package into the runner image.
 */

/** Global groups the listing form renders as DEDICATED fields, not as a generic select. */
export const SCALE_GROUP_SLUG = "scale";
export const MATERIAL_GROUP_SLUG = "material";
export const COLOR_GROUP_SLUG = "color";

export const DEDICATED_ATTRIBUTE_GROUP_SLUGS: readonly string[] = [
  SCALE_GROUP_SLUG,
  MATERIAL_GROUP_SLUG,
  COLOR_GROUP_SLUG,
];

/**
 * Groups that exist in the database but are never offered to sellers or
 * buyers. `vehicle_type` is a demo-seed leftover that only the search index
 * reads; the admin catalog hides it and the public group endpoints skip it.
 */
export const HIDDEN_ATTRIBUTE_GROUP_SLUGS: readonly string[] = ["vehicle_type"];

export function isDedicatedAttributeGroup(slug: string): boolean {
  return DEDICATED_ATTRIBUTE_GROUP_SLUGS.includes(slug);
}

export function isHiddenAttributeGroup(slug: string): boolean {
  return HIDDEN_ATTRIBUTE_GROUP_SLUGS.includes(slug);
}

/** The minimum shape the group predicates below need. */
export interface AttributeGroupRef {
  slug: string;
  manufacturerSlug: string | null | undefined;
}

/**
 * A "global custom" group: applies to every listing (no manufacturer scope),
 * is not one of the dedicated fields and is not hidden. These are the groups
 * an admin creates from the catalog screen; the listing form renders each as a
 * single-select and the API enforces `isRequired` for them.
 */
export function isGlobalCustomAttributeGroup(
  group: AttributeGroupRef,
): boolean {
  return (
    group.manufacturerSlug == null &&
    !isDedicatedAttributeGroup(group.slug) &&
    !isHiddenAttributeGroup(group.slug)
  );
}

export type AttributeGroupSelectionMode = "single" | "multi";

/**
 * How many values a listing may carry from a group. Global custom groups are
 * single-select; colors and manufacturer-scoped groups keep multi-select.
 */
export function attributeGroupSelectionMode(
  group: AttributeGroupRef,
): AttributeGroupSelectionMode {
  return isGlobalCustomAttributeGroup(group) ? "single" : "multi";
}
