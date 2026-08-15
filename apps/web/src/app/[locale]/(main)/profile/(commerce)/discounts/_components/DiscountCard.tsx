/** @format */

"use client";

import { useTranslations } from "next-intl";
import {
  EllipsisHorizontalIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  CalendarIcon,
  ReceiptPercentIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import {
  Badge,
  IconButton,
  StatusBadge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@tarodan/ui";
import {
  scopeLabels,
  discountStatusConfig,
  getDiscountStatus,
  formatDate,
  type Discount,
} from "../_lib/types";

interface DiscountCardProps {
  discount: Discount;
  onEdit: (discount: Discount) => void;
  onToggle: (discount: Discount) => void;
  onDelete: (discount: Discount) => void;
}

export default function DiscountCard({
  discount,
  onEdit,
  onToggle,
  onDelete,
}: DiscountCardProps) {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="truncate font-semibold text-heading">
              {discount.name}
            </h3>
            <StatusBadge
              status={getDiscountStatus(discount)}
              config={discountStatusConfig(t)}
              size="sm"
            />
          </div>

          {discount.description && (
            <p className="mb-3 truncate text-sm text-muted">
              {discount.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge
              variant="primary"
              size="sm"
              icon={
                discount.type === "percentage" ? (
                  <ReceiptPercentIcon className="h-3.5 w-3.5" />
                ) : (
                  <CurrencyDollarIcon className="h-3.5 w-3.5" />
                )
              }
            >
              {discount.type === "percentage"
                ? `%${discount.value}`
                : `${discount.value} TL`}
            </Badge>

            <Badge variant="outline" size="sm">
              {scopeLabels(t)[discount.scope] || discount.scope}
            </Badge>

            {discount.code ? (
              <Badge variant="secondary" size="sm" className="font-mono">
                {discount.code}
              </Badge>
            ) : (
              <span className="text-xs italic text-subtle">
                {t("seller.discounts.autoCode")}
              </span>
            )}

            <span className="flex items-center gap-1 text-muted">
              <CalendarIcon className="h-4 w-4" />
              {formatDate(discount.startDate, t("common.dateLocale"))} –{" "}
              {formatDate(discount.endDate, t("common.dateLocale"))}
            </span>

            <span className="text-muted">
              {discount.usageLimitTotal
                ? t("seller.discounts.usageCountOfLimit", {
                    used: discount.usedCount,
                    limit: discount.usageLimitTotal,
                  })
                : t("seller.discounts.usageCount", {
                    used: discount.usedCount,
                  })}
            </span>
          </div>
        </div>

        {/* Actions — collapsed into a "…" menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={t("common.actions")}
              variant="ghost"
              size="sm"
            >
              <EllipsisHorizontalIcon className="h-5 w-5" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onToggle(discount)}>
              {discount.isActive ? (
                <>
                  <XMarkIcon className="mr-2 h-4 w-4" />
                  {t("seller.discounts.disable")}
                </>
              ) : (
                <>
                  <CheckIcon className="mr-2 h-4 w-4" />
                  {t("seller.discounts.enable")}
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit(discount)}>
              <PencilIcon className="mr-2 h-4 w-4" />
              {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={() => onDelete(discount)}>
              <TrashIcon className="mr-2 h-4 w-4" />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
