"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const POPOVER_MAX_WIDTH = 280;
const VIEWPORT_MARGIN = 12;

/**
 * Single-line, non-wrapping text. Clipped with `…` when the cell narrows. The
 * native `title` tooltip kicks in ONLY when the text is actually clipped
 * (`scrollWidth > clientWidth`) — fully visible text shows nothing on hover.
 *
 * Touch devices have no hover state, so a clipped value would otherwise be
 * unreadable there. Tapping a clipped value opens a small portaled popover
 * with the full text instead — this stops the tap from also triggering a
 * row click / link navigation, since reading the value is the deliberate
 * action here, not navigating away.
 */
export function TruncatedText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const title = typeof children === "string" ? children : undefined;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || popoverRef.current?.contains(target))
        return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const reveal = (e: SyntheticEvent) => {
    if (!truncated || !title) return;
    e.stopPropagation();
    e.preventDefault();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 6,
        left: Math.max(
          VIEWPORT_MARGIN,
          Math.min(
            rect.left,
            window.innerWidth - POPOVER_MAX_WIDTH - VIEWPORT_MARGIN,
          ),
        ),
      });
    }
    setOpen(true);
  };

  return (
    <>
      <span
        ref={ref}
        className={cn(
          "block truncate",
          truncated && "cursor-pointer",
          className,
        )}
        title={truncated && title ? title : undefined}
        role={truncated ? "button" : undefined}
        tabIndex={truncated ? 0 : undefined}
        onClick={reveal}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") reveal(e);
        }}
      >
        {children}
      </span>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              top: pos.top,
              left: pos.left,
              maxWidth: POPOVER_MAX_WIDTH,
            }}
            className="fixed z-popover rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-body shadow-lg"
          >
            {title}
          </div>,
          document.body,
        )}
    </>
  );
}
