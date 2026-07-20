/** @format */

"use client";

import { type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { IconButton, iconButtonVariants } from "@tarodan/ui";

/**
 * Shared page-header and row-action components. List-specific search, filters,
 * selection and pagination live in the ResourceList compound.
 */

export function PageHeader({
  title,
  badge,
  description,
  backHref,
  backLabel,
  children,
}: {
  title: ReactNode;
  /** Rendered next to the title (e.g. a count/status pill). */
  badge?: ReactNode;
  description?: ReactNode;
  /** When set, a back chevron links here before the title (detail pages). */
  backHref?: string;
  backLabel?: string;
  children?: ReactNode;
}) {
  const t = useTranslations();
  const resolvedBackLabel = backLabel ?? t("common.back");
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label={resolvedBackLabel}
            title={resolvedBackLabel}
            // h-8 = text-2xl line box → items-center aligns the chevron to the title's vertical center
            className="-ml-1 flex h-8 items-center rounded-lg px-1 text-muted transition-colors hover:bg-surface-alt hover:text-heading"
          >
            <ChevronLeftIcon className="h-7 w-7" />
          </Link>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-heading">{title}</h1>
            {badge}
          </div>
          {description != null && (
            <p className="mt-1 text-muted text-sm">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}

type ActionVariant = "default" | "danger" | "success" | "primary";

/** Row-action variant → shared IconButton variant. */
const ICON_VARIANT: Record<
  ActionVariant,
  "ghost" | "danger" | "success" | "primary"
> = {
  default: "ghost",
  danger: "danger",
  success: "success",
  primary: "primary",
};

/**
 * Icon button for a row action (View/Edit/Delete/Approve...). Thin wrapper over the
 * shared `IconButton`; renders a Link styled the same way when `href` is given.
 */
export function ActionIconButton({
  icon: Icon,
  onClick,
  title,
  href,
  variant = "default",
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  title: string;
  href?: string;
  variant?: ActionVariant;
  disabled?: boolean;
}) {
  const v = ICON_VARIANT[variant];
  if (href) {
    return (
      <Link
        href={href}
        className={iconButtonVariants({ variant: v })}
        title={title}
        aria-label={title}
      >
        <Icon className="h-5 w-5" />
      </Link>
    );
  }
  return (
    <IconButton
      variant={v}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
    >
      <Icon className="h-5 w-5" />
    </IconButton>
  );
}
