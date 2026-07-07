'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

/**
 * The single card shell for EVERY auth screen (login, register, business
 * register, forgot / reset password, verify email — form state AND success /
 * status states). One wrapper, one radius/shadow/padding/border, one header
 * position: title + optional description, always top-left, in the same spot on
 * every screen. Screens render only their fields (or status content) as
 * `children`; links go in `footer`. No per-form gradient badges or bespoke cards.
 */
export function AuthCard({
  title,
  description,
  backHref,
  backLabel,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  /** Optional "back" link above the header (e.g. back to login). */
  backHref?: string;
  backLabel?: React.ReactNode;
  children: React.ReactNode;
  /** Optional footer row (secondary links), centered below the content. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-8 shadow-sm">
      {backHref && (
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-heading"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {backLabel}
        </Link>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-heading">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>

      {children}

      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
