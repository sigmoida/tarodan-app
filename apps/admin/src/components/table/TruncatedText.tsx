"use client";

import {
  useLayoutEffect,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "@tarodan/ui/hooks";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { NO_HOVER_MEDIA_QUERY } from "@/lib/breakpoints";
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
 * action here, not navigating away. That interception is scoped to
 * no-hover (touch) devices only — hover-capable devices already get the
 * value via the native `title` tooltip, so a click there must behave like
 * a normal click (e.g. still navigate a wrapping `Link`).
 */
export function TruncatedText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const isTouch = useMediaQuery(NO_HOVER_MEDIA_QUERY);
  const [truncated, setTruncated] = useState(false);
  const title = typeof children === "string" ? children : undefined;

  const {
    open,
    toggle,
    triggerRef: ref,
    popoverRef,
    pos,
  } = useAnchoredPopover<HTMLSpanElement>({
    offsetY: 6,
    width: POPOVER_MAX_WIDTH,
    viewportMargin: VIEWPORT_MARGIN,
    // Re-measuring a small text popover on every scroll tick isn't worth
    // it — just close it, matching the previous behavior here.
    onViewportChange: "close",
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, ref]);

  const reveal = (e: SyntheticEvent) => {
    if (!truncated || !title) return;
    e.stopPropagation();
    e.preventDefault();
    toggle();
  };

  // Only intercept the click on touch — hover-capable devices must let it
  // through to whatever the cell wraps (Link nav, row click, …).
  const onClick = (e: SyntheticEvent) => {
    if (isTouch) reveal(e);
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
        onClick={onClick}
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
