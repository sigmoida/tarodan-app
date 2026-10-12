"use client";

import { useRef, useState, type PointerEvent, type RefObject } from "react";
import type { AdHotspotRect } from "@tarodan/types";
import type { AdHotspotFormRow } from "../_lib/types";
import {
  type FractionPoint,
  type ResizeHandle,
  moveRect,
  othersOf,
  pointerToFraction,
  rectFromPoints,
  resizeRect,
  snapBack,
} from "../_lib/hotspotGeometry";

type Drag =
  | { kind: "draw"; origin: FractionPoint }
  | { kind: "move"; index: number; origin: FractionPoint; start: AdHotspotRect }
  | {
      kind: "resize";
      index: number;
      handle: ResizeHandle;
      start: AdHotspotRect;
    };

/** Sürükleme sırasında ekranda gösterilen son GEÇERLİ dikdörtgen (index null = yeni çizim). */
export interface HotspotPreview {
  index: number | null;
  rect: AdHotspotRect;
}

interface Options {
  value: readonly AdHotspotFormRow[];
  max: number;
  /** Görsel kutusu; sürükleme koordinatları buna göre kesire çevrilir. */
  surfaceRef: RefObject<HTMLElement | null>;
  onChange: (next: AdHotspotFormRow[]) => void;
  onSelect: (index: number | null) => void;
}

const rectOf = (h: AdHotspotRect): AdHotspotRect => ({
  x: h.x,
  y: h.y,
  width: h.width,
  height: h.height,
});

/**
 * Çizim / taşıma / köşeden boyutlandırma (pointer events: fare + dokunmatik).
 * Her hareket adayı çakışma, sınır ve en küçük boyut için denetlenir; geçersiz
 * aday uygulanmaz, ekranda son geçerli dikdörtgen kalır (geri sıçrama).
 */
export function useHotspotDrag({
  value,
  max,
  surfaceRef,
  onChange,
  onSelect,
}: Options) {
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<HotspotPreview | null>(null);

  const pointAt = (e: PointerEvent): FractionPoint | null => {
    const el = surfaceRef.current;
    return el ? pointerToFraction(e.clientX, e.clientY, el.getBoundingClientRect()) : null;
  };

  const capture = (e: PointerEvent) =>
    surfaceRef.current?.setPointerCapture(e.pointerId);

  const onSurfaceDown = (e: PointerEvent) => {
    onSelect(null);
    if (value.length >= max) return;
    const origin = pointAt(e);
    if (!origin) return;
    capture(e);
    drag.current = { kind: "draw", origin };
    setPreview(null);
  };

  const beginMove = (e: PointerEvent, index: number) => {
    e.stopPropagation();
    const origin = pointAt(e);
    if (!origin) return;
    onSelect(index);
    capture(e);
    const start = rectOf(value[index]);
    drag.current = { kind: "move", index, origin, start };
    setPreview({ index, rect: start });
  };

  const beginResize = (e: PointerEvent, index: number, handle: ResizeHandle) => {
    e.stopPropagation();
    onSelect(index);
    capture(e);
    const start = rectOf(value[index]);
    drag.current = { kind: "resize", index, handle, start };
    setPreview({ index, rect: start });
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    const p = pointAt(e);
    if (!d || !p) return;
    if (d.kind === "draw") {
      const next = snapBack(
        rectFromPoints(d.origin, p),
        preview?.rect ?? null,
        othersOf(value, null),
      );
      setPreview(next && { index: null, rect: next });
      return;
    }
    const candidate =
      d.kind === "move"
        ? moveRect(d.start, p.x - d.origin.x, p.y - d.origin.y)
        : resizeRect(d.start, d.handle, p);
    const next = snapBack(
      candidate,
      preview?.rect ?? d.start,
      othersOf(value, d.index),
    );
    setPreview(next && { index: d.index, rect: next });
  };

  const end = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    const result = preview;
    setPreview(null);
    if (!commit || !d || !result) return;
    if (d.kind === "draw") {
      onChange([...value, { ...result.rect, label: "", linkUrl: "" }]);
      onSelect(value.length);
      return;
    }
    onChange(value.map((h, i) => (i === d.index ? { ...h, ...result.rect } : h)));
  };

  return {
    preview,
    beginMove,
    beginResize,
    surfaceHandlers: {
      onPointerDown: onSurfaceDown,
      onPointerMove: onMove,
      onPointerUp: () => end(true),
      onPointerCancel: () => end(false),
    },
  };
}
