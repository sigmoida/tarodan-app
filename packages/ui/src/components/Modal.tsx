/** @format */

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";
import { IconButton } from "./IconButton";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "wide" | "full";

const modalSizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  wide: "max-w-6xl",
  full: "max-w-[calc(100vw-2rem)]",
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Modal title (optional — renders a header) */
  title?: string;
  /** Semantic dialog width. Every size remains constrained to the viewport. */
  size?: ModalSize;
  /** Max width class (default: max-w-md) */
  maxWidth?: "max-w-sm" | "max-w-md" | "max-w-lg" | "max-w-xl" | "max-w-2xl";
  /** Fixed action area rendered below the scrollable body. */
  footer?: React.ReactNode;
  /** Close on backdrop click (default: true) */
  closeOnBackdrop?: boolean;
  /** Close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Accessible label for the header close action. */
  closeLabel?: string;
  /** Prevent dismissing through the header action while an operation is pending. */
  closeButtonDisabled?: boolean;
  /** Hide the close action for non-dismissible task dialogs. */
  showCloseButton?: boolean;
  bodyClassName?: string;
  className?: string;
}

/**
 * Accessible modal dialog built on Radix. Radix owns focus trapping/restoration,
 * nested-layer Escape handling, outside interaction, and ref-counted scroll lock.
 */
export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      children,
      title,
      size = "md",
      maxWidth,
      footer,
      closeOnBackdrop = true,
      closeOnEscape = true,
      closeLabel = "Kapat",
      closeButtonDisabled = false,
      showCloseButton = true,
      bodyClassName,
      className,
    },
    ref,
  ) => (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* One stacking context per dialog lets a later nested dialog cover its parent. */}
        <div className="pointer-events-none fixed inset-0 z-modal">
          <DialogPrimitive.Overlay className="pointer-events-auto fixed inset-0 z-overlay bg-heading/50 backdrop-blur-sm" />
          <DialogPrimitive.Content
            ref={ref}
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              if (!closeOnEscape) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!closeOnBackdrop) event.preventDefault();
            }}
            className={cn(
              "pointer-events-auto fixed left-1/2 top-1/2 z-modal flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-surface-elevated shadow-elevated focus:outline-none",
              maxWidth ?? modalSizeClasses[size],
              className,
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
              {title ? (
                <DialogPrimitive.Title className="min-w-0 text-lg font-semibold leading-tight text-heading">
                  {title}
                </DialogPrimitive.Title>
              ) : (
                <DialogPrimitive.Title className="sr-only">
                  Dialog
                </DialogPrimitive.Title>
              )}
              {showCloseButton && (
                <DialogPrimitive.Close asChild>
                  <IconButton
                    aria-label={closeLabel}
                    variant="ghost"
                    size="sm"
                    disabled={closeButtonDisabled}
                    className="-mr-2 shrink-0 bg-transparent"
                  >
                    <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                  </IconButton>
                </DialogPrimitive.Close>
              )}
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5",
                bodyClassName,
              )}
            >
              {children}
            </div>
            {footer && (
              <div className="shrink-0 border-t border-border bg-surface-elevated px-6 py-4">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  ),
);

Modal.displayName = "Modal";
