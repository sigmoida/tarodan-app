/** @format */

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";
import { IconButton } from "./IconButton";

export type DrawerSide = "left" | "right";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Panelin girdiği kenar. */
  side?: DrawerSide;
  /** Başlık — verilmezse `ariaLabel` görünmez başlık olarak kullanılır. */
  title?: React.ReactNode;
  ariaLabel?: string;
  /** Panel genişliği. Varsayılan mobilde neredeyse tam ekran, sm+ sabit. */
  widthClassName?: string;
  closeLabel?: string;
  /** Gövdenin altında sabit kalan alan (ör. çıkış butonu). */
  footer?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children?: React.ReactNode;
}

const sideClasses: Record<DrawerSide, string> = {
  left: "left-0 animate-slide-in-left",
  right: "right-0 animate-slide-in-right",
};

/**
 * Kenardan açılan panel (sheet) — `Modal` ile aynı Radix temeli üzerinde, ama
 * ortada değil bir kenara yapışık ve tam yükseklikte. Odak tuzağı, Escape,
 * dışarı tıklama ve gövde kaydırma kilidi Radix'in sorumluluğunda.
 *
 * Mobil gezinme çekmeceleri için var: `Modal`'ı yan panel gibi göstermek için
 * her çağıran yerde sınıf ezmek, iki uygulamada sessizce birbirinden ayrılan
 * kopyalar üretiyordu.
 */
export const Drawer = React.forwardRef<HTMLDivElement, DrawerProps>(
  (
    {
      isOpen,
      onClose,
      side = "left",
      title,
      ariaLabel,
      widthClassName = "w-[min(20rem,calc(100vw-3rem))]",
      closeLabel = "Kapat",
      footer,
      bodyClassName,
      className,
      children,
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
        <div className="pointer-events-none fixed inset-0 z-modal">
          <DialogPrimitive.Overlay className="pointer-events-auto fixed inset-0 z-overlay bg-heading/50" />
          <DialogPrimitive.Content
            ref={ref}
            className={cn(
              "pointer-events-auto fixed inset-y-0 z-modal flex h-full flex-col bg-surface-elevated shadow-elevated focus:outline-none",
              sideClasses[side],
              widthClassName,
              className,
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
              {title ? (
                <DialogPrimitive.Title className="min-w-0 truncate text-base font-semibold text-heading">
                  {title}
                </DialogPrimitive.Title>
              ) : (
                <DialogPrimitive.Title className="sr-only">
                  {ariaLabel ?? "Drawer"}
                </DialogPrimitive.Title>
              )}
              <DialogPrimitive.Close asChild>
                <IconButton
                  aria-label={closeLabel}
                  variant="ghost"
                  size="sm"
                  className="-mr-1 shrink-0 bg-transparent"
                >
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </IconButton>
              </DialogPrimitive.Close>
            </div>

            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                bodyClassName,
              )}
            >
              {children}
            </div>

            {footer && (
              <div className="shrink-0 border-t border-border">{footer}</div>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  ),
);

Drawer.displayName = "Drawer";
