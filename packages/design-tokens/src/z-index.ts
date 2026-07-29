/**
 * Shared stacking order for app chrome and portalled UI layers.
 *
 * Keep enough space between layers for rare, component-local stacking needs,
 * but use these semantic levels instead of arbitrary values in shared UI.
 */
export const zIndex = {
  navigationOverlay: 20,
  navigation: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
} as const;
