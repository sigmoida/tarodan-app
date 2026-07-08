'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

/**
 * The single shell for EVERY auth screen (login, register, business register,
 * forgot / reset password, verify email — form state AND success / status
 * states). A plain constrained column — no card chrome (border / padding /
 * shadow / bg); the surrounding layout owns the background. One header position:
 * title + optional description, always top-left, in the same spot on every
 * screen. Screens render only their fields (or status content) as `children`;
 * links go in `footer`.
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
    <div className="w-full max-w-md">
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
