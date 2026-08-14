/**
 * Must match Tailwind's `lg` breakpoint — `tailwind.config.ts` has no custom
 * `screens`, so this is Tailwind's stock default (1024px). Single source for
 * the desktop/mobile-drawer split so JS-side media queries (e.g.
 * `SidebarNavDrawer`) can't silently drift from the CSS breakpoint.
 */
export const LG_BREAKPOINT_PX = 1024;
export const LG_MEDIA_QUERY = `(min-width: ${LG_BREAKPOINT_PX}px)`;

/** Tailwind's `sm` breakpoint (also unmodified in tailwind.config.ts). */
export const SM_BREAKPOINT_PX = 640;
export const SM_MEDIA_QUERY = `(min-width: ${SM_BREAKPOINT_PX}px)`;

/**
 * True on devices with no real hover capability (touchscreens). Gates
 * touch-only interaction patterns (e.g. tap-to-reveal) so they don't also
 * swallow mouse clicks on hover-capable devices, which already have the
 * native hover affordance and expect a click to do its normal thing
 * (navigate, etc).
 */
export const NO_HOVER_MEDIA_QUERY = "(hover: none)";
