import {
  AD_HOTSPOT_MIN_SIZE,
  adHotspotInBounds,
  adHotspotsOverlap,
  type AdHotspotRect,
} from "@tarodan/types";

/** Görsel üzerindeki bir nokta (kesir, 0–1). */
export interface FractionPoint {
  x: number;
  y: number;
}

/** Görselin ekrandaki kutusu (getBoundingClientRect alt kümesi). */
export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

/** Kesirler 4 basamağa yuvarlanır: kayan nokta kırıntısı kaydedilmesin. */
const PRECISION = 1e4;
const round = (n: number) => Math.round(n * PRECISION) / PRECISION;

export const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/** Ekran koordinatını görselin kesrine çevirir; görsel dışına taşarsa kenara kıstırılır. */
export function pointerToFraction(
  clientX: number,
  clientY: number,
  box: PixelBox,
): FractionPoint {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return {
    x: round(clamp01((clientX - box.left) / box.width)),
    y: round(clamp01((clientY - box.top) / box.height)),
  };
}

/** İki köşeden (sürüklemenin başı/sonu) normalize dikdörtgen: her yönde çizilebilir. */
export function rectFromPoints(
  a: FractionPoint,
  b: FractionPoint,
): AdHotspotRect {
  return {
    x: round(Math.min(a.x, b.x)),
    y: round(Math.min(a.y, b.y)),
    width: round(Math.abs(a.x - b.x)),
    height: round(Math.abs(a.y - b.y)),
  };
}

/** Alanı kaydırır; boyutu korur, görsel sınırında durur. */
export function moveRect(
  rect: AdHotspotRect,
  dx: number,
  dy: number,
): AdHotspotRect {
  return {
    ...rect,
    x: round(Math.min(1 - rect.width, Math.max(0, rect.x + dx))),
    y: round(Math.min(1 - rect.height, Math.max(0, rect.y + dy))),
  };
}

/** Köşe tutamacı `point`'e sürüklenirken karşı köşe sabit kalır. */
export function resizeRect(
  rect: AdHotspotRect,
  handle: ResizeHandle,
  point: FractionPoint,
): AdHotspotRect {
  const fixed: FractionPoint = {
    x: handle.endsWith("w") ? rect.x + rect.width : rect.x,
    y: handle.startsWith("n") ? rect.y + rect.height : rect.y,
  };
  return rectFromPoints(fixed, point);
}

const EPSILON = 1e-6;

/** Geçerli alan: görselin içinde, en küçük boyutun üstünde ve diğer alanlarla çakışmıyor. */
export function isRectValid(
  rect: AdHotspotRect,
  others: readonly AdHotspotRect[],
): boolean {
  return (
    adHotspotInBounds(rect) &&
    rect.width >= AD_HOTSPOT_MIN_SIZE - EPSILON &&
    rect.height >= AD_HOTSPOT_MIN_SIZE - EPSILON &&
    !others.some((o) => adHotspotsOverlap(o, rect))
  );
}

/**
 * Aday geçerliyse aday, değilse son geçerli dikdörtgen ("geri sıçrama").
 * `last` yoksa (henüz geçerli çizim olmadı) null döner.
 */
export function snapBack(
  candidate: AdHotspotRect,
  last: AdHotspotRect | null,
  others: readonly AdHotspotRect[],
): AdHotspotRect | null {
  return isRectValid(candidate, others) ? candidate : last;
}

/** Dizideki `index` dışındaki alanların dikdörtgenleri. */
export function othersOf<T extends AdHotspotRect>(
  list: readonly T[],
  index: number | null,
): AdHotspotRect[] {
  return list.filter((_, i) => i !== index);
}
