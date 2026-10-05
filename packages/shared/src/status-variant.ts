/**
 * Canonical, platform-agnostic semantic variant vocabulary.
 *
 * @tarodan/ui accepts these values so a single `StatusConfig` map can drive
 * badges across the web surfaces.
 *
 * Five values, on purpose: `default` is the brand (primary) colour, three
 * carry meaning (success / warning / danger) and `outline` is the neutral one
 * — anything that is merely a label, an inactive state or a category.
 */
export type StatusVariant =
  "default" | "success" | "warning" | "danger" | "outline";
