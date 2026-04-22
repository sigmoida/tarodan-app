import React, { useEffect, useCallback } from 'react';
import { cn } from './utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Modal title (optional — renders a header) */
  title?: string;
  /** Max width class (default: max-w-md) */
  maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl';
  /** Close on backdrop click (default: true) */
  closeOnBackdrop?: boolean;
  /** Close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Custom z-index class (default: z-50) */
  zIndex?: string;
  className?: string;
}

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      children,
      title,
      maxWidth = 'max-w-md',
      closeOnBackdrop = true,
      closeOnEscape = true,
      zIndex = 'z-50',
      className,
    },
    ref,
  ) => {
    const handleEscape = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Escape' && closeOnEscape) onClose();
      },
      [closeOnEscape, onClose],
    );

    useEffect(() => {
      if (!isOpen) return;
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }, [isOpen, handleEscape]);

    if (!isOpen) return null;

    return (
      <div
        ref={ref}
        className={cn('fixed inset-0 flex items-center justify-center p-4', zIndex)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-heading/50 backdrop-blur-sm"
          onClick={closeOnBackdrop ? onClose : undefined}
          aria-hidden="true"
        />
        {/* Content */}
        <div
          className={cn(
            'relative w-full bg-surface-elevated rounded-xl shadow-elevated p-6',
            maxWidth,
            className,
          )}
        >
          {title && (
            <h3 className="text-lg font-semibold text-heading mb-4">{title}</h3>
          )}
          {children}
        </div>
      </div>
    );
  },
);

Modal.displayName = 'Modal';
