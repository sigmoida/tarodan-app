import React, { useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';

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
            'relative flex max-h-[90vh] w-full flex-col rounded-xl bg-surface-elevated shadow-elevated',
            maxWidth,
            className,
          )}
        >
          {/* Sabit başlık — gövde scroll ederken kaybolmasın */}
          {title && (
            <h3 className="flex-shrink-0 px-6 pb-4 pt-5 text-lg font-semibold leading-tight text-heading">
              {title}
            </h3>
          )}
          {/* Scroll edilebilir gövde — uzun içerik (ör. değerlendirme formu) taşarsa kaydırılır */}
          <div className={cn('overflow-y-auto px-6 pb-6', title ? '' : 'pt-5')}>
            {children}
          </div>
        </div>
      </div>
    );
  },
);

Modal.displayName = 'Modal';
