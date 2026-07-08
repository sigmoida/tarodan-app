/**
 * @tarodan/brand — the single source of truth for Tarodan brand assets.
 *
 * Framework-agnostic on purpose: it exports raw asset data (data URIs and, later,
 * metadata / other variants) and nothing React- or Next-specific. That keeps it
 * consumable from anywhere — admin renders the data URI inline, web can emit it to
 * `public/` via a build step, etc. How each app *delivers* the mark is a separate
 * decision layered on top of this package.
 */

export { tarodanLogoDataUri } from './assets/tarodan-logo';
export { tarodanLogoTransparentDataUri } from './assets/tarodan-logo-transparent';
