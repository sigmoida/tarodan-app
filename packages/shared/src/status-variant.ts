/**
 * Canonical, platform-agnostic semantic variant vocabulary.
 *
 * @tarodan/ui accepts these values so a single `StatusConfig` map can drive
 * badges across the web surfaces.
 *
 * NOTE: `destructive` is a legacy alias of `danger` (identical styling on
 * existing web styling). It is kept for backward-compat with existing web
 * usage and should be codemodded to `danger` in a later pass, then removed.
 */
export type StatusVariant =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline"
  | "destructive";
