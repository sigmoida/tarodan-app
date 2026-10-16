/** @format */

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";
import { IconButton } from "./IconButton";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "wide" | "full";

/**
 * - `default`: başlık satırı (kenarlıklı) + dolgulu gövde + yüzey arka planı.
 * - `media`: yalnız içerik (ör. popup afişi): başlık satırı, kenarlık, dolgu
 *   ve arka plan yok; kapatma düğmesi içeriğin sağ üstüne biner. Başlık ekran
 *   okuyucu için `sr-only` kalır; odak tuzağı / Esc / kaydırma kilidi aynıdır.
 */
export type ModalVariant = "default" | "media";

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
  children?: React.ReactNode;
  /** Modal title (optional — renders a header) */
  title?: React.ReactNode;
  /** Accessible description rendered at the top of the scrollable body. */
  description?: React.ReactNode;
  /** Accessible fallback when the dialog intentionally has no visible title. */
  ariaLabel?: string;
  /** Semantic dialog width. Every size remains constrained to the viewport. */
  size?: ModalSize;
  /** Visual frame (default: `default`). See `ModalVariant`. */
  variant?: ModalVariant;
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
  /** Prevent every dismiss path while a mutation or transition is pending. */
  dismissDisabled?: boolean;
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
      description,
      ariaLabel,
      size = "md",
      variant = "default",
      maxWidth,
      footer,
      closeOnBackdrop = true,
      closeOnEscape = true,
      closeLabel = "Kapat",
      closeButtonDisabled = false,
      dismissDisabled = false,
      showCloseButton = true,
      bodyClassName,
      className,
    },
    ref,
  ) => {
    const descriptionId = React.useId();
    const isMedia = variant === "media";

    const closeButton = showCloseButton && (
      <DialogPrimitive.Close asChild>
        <IconButton
          aria-label={closeLabel}
          variant="ghost"
          size="sm"
          disabled={closeButtonDisabled || dismissDisabled}
          className={
            isMedia
              ? // İçeriğin üstüne biner: her görselde okunsun diye koyu,
                // yuvarlak zemin.
                "absolute right-2 top-2 z-10 rounded-full bg-heading/70 text-inverted shadow-elevated hover:bg-heading/90 hover:text-inverted"
              : "-mr-2 shrink-0 bg-transparent"
          }
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </DialogPrimitive.Close>
    );

    return (
      <DialogPrimitive.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && !dismissDisabled) onClose();
        }}
      >
        <DialogPrimitive.Portal>
          {/* One stacking context per dialog lets a later nested dialog cover its parent. */}
          <div className="pointer-events-none fixed inset-0 z-modal">
            <DialogPrimitive.Overlay className="pointer-events-auto fixed inset-0 z-overlay bg-heading/50 backdrop-blur-sm" />
            <DialogPrimitive.Content
              ref={ref}
              aria-describedby={description ? descriptionId : undefined}
              onEscapeKeyDown={(event) => {
                if (!closeOnEscape || dismissDisabled) event.preventDefault();
              }}
              onPointerDownOutside={(event) => {
                // Portala taşınan iç katmanlar (tarih seçici takvimi) DOM'da
                // dialogun dışındadır ama MANTIKEN içindedir. İşaretlenmemiş
                // olsalardı takvimde bir güne tıklamak dialogu kapatırdı.
                const target = event.detail.originalEvent
                  .target as Element | null;
                if (target?.closest?.("[data-ui-popover]")) {
                  event.preventDefault();
                  return;
                }
                if (!closeOnBackdrop || dismissDisabled) event.preventDefault();
              }}
              className={cn(
                // Genişlik, 1rem'lik kenar boşluğunun YANI SIRA yatay güvenli
                // alanı da düşer: yatay kullanımda pencere ortalanmış olsa bile
                // kenarı çentiğin altına girebiliyordu.
                "pointer-events-auto fixed left-1/2 top-1/2 z-modal flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem-env(safe-area-inset-left)-env(safe-area-inset-right))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl focus:outline-none",
                isMedia ? "bg-transparent" : "bg-surface-elevated shadow-elevated",
                maxWidth ?? modalSizeClasses[size],
                className,
              )}
            >
              {isMedia ? (
                <>
                  <DialogPrimitive.Title className="sr-only">
                    {title ?? ariaLabel ?? "Dialog"}
                  </DialogPrimitive.Title>
                  {closeButton}
                </>
              ) : (
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
                  {title ? (
                    <DialogPrimitive.Title className="min-w-0 text-lg font-semibold leading-tight text-heading">
                      {title}
                    </DialogPrimitive.Title>
                  ) : (
                    <DialogPrimitive.Title className="sr-only">
                      {ariaLabel ?? "Dialog"}
                    </DialogPrimitive.Title>
                  )}
                  {closeButton}
                </div>
              )}
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                  !isMedia && "px-6 py-5",
                  bodyClassName,
                )}
              >
                {description && (
                  <DialogPrimitive.Description asChild>
                    <div
                      id={descriptionId}
                      className={cn(children && "mb-4", "text-sm text-body")}
                    >
                      {description}
                    </div>
                  </DialogPrimitive.Description>
                )}
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
    );
  },
);

Modal.displayName = "Modal";
