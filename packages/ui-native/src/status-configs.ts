/**
 * Status/enum → label + variant metadata.
 *
 * The maps live in the platform-agnostic @tarodan/shared package (single
 * source of truth shared with web @tarodan/ui). Re-exported here so existing
 * `@tarodan/ui-native` imports (orderStatusConfig, StatusConfig, ...) keep
 * working unchanged.
 */
export * from '@tarodan/shared';
