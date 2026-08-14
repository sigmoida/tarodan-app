"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export interface UseAnchoredPopoverOptions {
  /** Vertical gap (px) between the trigger's bottom edge and the popover. */
  offsetY?: number;
  /** Popover width (px) — used to clamp its horizontal position inside the viewport. */
  width?: number;
  /** Minimum gap (px) kept from the viewport edges. */
  viewportMargin?: number;
  /**
   * What a trigger-moving viewport event (ancestor scroll or window resize)
   * does while open: keep the popover positioned against the trigger
   * (`"reposition"`, the default), or just close it (`"close"` — cheaper
   * when the popover content isn't worth re-measuring, e.g. a small text
   * reveal).
   */
  onViewportChange?: "reposition" | "close";
}

export interface UseAnchoredPopoverResult<
  T extends HTMLElement,
  P extends HTMLElement,
> {
  open: boolean;
  toggle: () => void;
  close: () => void;
  triggerRef: RefObject<T>;
  popoverRef: RefObject<P>;
  /** `null` until the trigger has been measured (first open). */
  pos: { top: number; left: number } | null;
}

/**
 * Shared behavior for a trigger + `createPortal`-to-`document.body` popover
 * anchored to it: viewport-clamped `fixed` positioning, close on outside
 * click / Escape, and reposition (or close) on scroll/resize. Extracted from
 * `DatePicker` and admin's `TruncatedText`, which had each grown the same
 * ~40 lines of this independently.
 */
export function useAnchoredPopover<
  T extends HTMLElement = HTMLElement,
  P extends HTMLElement = HTMLDivElement,
>(options: UseAnchoredPopoverOptions = {}): UseAnchoredPopoverResult<T, P> {
  const {
    offsetY = 8,
    width = 288,
    viewportMargin = 16,
    onViewportChange = "reposition",
  } = options;

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);
  const popoverRef = useRef<P>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + offsetY,
      left: Math.max(
        viewportMargin,
        Math.min(rect.left, window.innerWidth - width - viewportMargin),
      ),
    });
  }, [offsetY, width, viewportMargin]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  // Outside-click / Escape close. Portaled content sits outside the
  // trigger's DOM subtree, so both refs need checking.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const run =
      onViewportChange === "close" ? () => setOpen(false) : updatePosition;

    // rAF-throttled: a momentum scroll can fire this dozens of times per
    // second, and `run` does a getBoundingClientRect() (forces layout) plus
    // a state update — collapse any events landing within the same frame
    // into a single call instead of doing that work per raw event.
    let frame: number | null = null;
    const handler = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        run();
      });
    };

    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [open, onViewportChange, updatePosition]);

  return {
    open,
    toggle: () => setOpen((o) => !o),
    close: () => setOpen(false),
    triggerRef,
    popoverRef,
    pos,
  };
}
