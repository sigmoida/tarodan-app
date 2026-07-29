/** @format */

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "../lib/utils";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Modal title (optional — renders a header) */
  title?: string;
  /** Max width class (default: max-w-md) */
  maxWidth?: "max-w-sm" | "max-w-md" | "max-w-lg" | "max-w-xl" | "max-w-2xl";
  /** Close on backdrop click (default: true) */
  closeOnBackdrop?: boolean;
  /** Close on Escape key (default: true) */
  closeOnEscape?: boolean;
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
      maxWidth = "max-w-md",
      closeOnBackdrop = true,
      closeOnEscape = true,
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
              "pointer-events-auto fixed left-1/2 top-1/2 z-modal flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface-elevated shadow-elevated focus:outline-none",
              maxWidth,
              className,
            )}
          >
            {title ? (
              <DialogPrimitive.Title className="flex-shrink-0 px-6 pb-4 pt-5 text-lg font-semibold leading-tight text-heading">
                {title}
              </DialogPrimitive.Title>
            ) : (
              <DialogPrimitive.Title className="sr-only">
                Dialog
              </DialogPrimitive.Title>
            )}
            <div
              className={cn("overflow-y-auto px-6 pb-6", title ? "" : "pt-5")}
            >
              {children}
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  ),
);

Modal.displayName = "Modal";
