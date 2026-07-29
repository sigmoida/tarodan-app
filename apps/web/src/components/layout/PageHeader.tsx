/** @format */

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";

/**
 * The single page-header band for marketplace list pages (listings, collections,
 * …) and detail pages. One consistent frame: an optional `breadcrumb` row on top,
 * the accent bar + title, an optional description, and an optional right-side
 * `actions` slot (create button, sort/layout controls, status badge, …). Mirrors
 * the admin `PageHeader` so every page's header band is built the same way.
 *
 * Detail pages pass `backHref` (a URL) or `onBack` (a callback, e.g. history
 * back): the title's left accent bar is then replaced by a chevron-left back
 * control — so the back lives in the header band, in place of the bar, instead of
 * a separate row above it.
 *
 * `title` is optional: a detail page can render this band with only a
 * `breadcrumb`, so its top zone occupies the same footprint (same left edge, same
 * bottom rhythm via `PageShell`'s `space-y`) as a list page's titled header.
 */
const backControlCls =
  "-ml-1 flex-shrink-0 rounded-md p-0.5 text-muted transition-colors hover:bg-surface-alt hover:text-heading";

export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  backHref,
  onBack,
  backLabel = "Geri",
}: {
  breadcrumb?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** When set, the left accent bar becomes a chevron-left link to this URL. */
  backHref?: string;
  /** Alternative to `backHref` for dynamic back (e.g. history back). */
  onBack?: () => void;
  /** Accessible label for the back control (default "Geri"). */
  backLabel?: string;
}) {
  const hasRow = title || description || actions;

  const backControl = backHref ? (
    <Link href={backHref} aria-label={backLabel} className={backControlCls}>
      <ChevronLeftIcon className="h-6 w-6" />
    </Link>
  ) : onBack ? (
    // eslint-disable-next-line no-restricted-syntax -- icon-only back affordance inside the title row
    <button
      type="button"
      onClick={onBack}
      aria-label={backLabel}
      className={backControlCls}
    >
      <ChevronLeftIcon className="h-6 w-6" />
    </button>
  ) : (
    <span className="h-6 w-1 flex-shrink-0 rounded-sm bg-primary-500" />
  );

  return (
    <div className="flex flex-col gap-2 py-2">
      {breadcrumb}
      {hasRow && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h1 className="flex items-center gap-2 text-2xl font-bold text-heading">
                {backControl}
                <span className="truncate">{title}</span>
              </h1>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
