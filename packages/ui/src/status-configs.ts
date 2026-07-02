/**
 * Status/enum → label + variant metadata.
 *
 * The actual maps now live in the platform-agnostic @tarodan/shared package
 * so web (@tarodan/ui) and mobile (@tarodan/ui-native) share a single source
 * of truth. This module simply re-exports them (plus the web-specific
 * `BadgeVariant` type) so existing `@tarodan/ui` imports keep working.
 */
export * from '@tarodan/shared';

import type { VariantProps } from 'class-variance-authority';
import type { badgeVariants } from './Badge';

/**
 * Web badge variant, derived from the CVA config. Superset of the shared
 * `StatusVariant` (also includes the legacy `destructive` alias).
 */
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
