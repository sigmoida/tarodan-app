"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}

/**
 * Shared pagination block for admin list pages.
 * Deduplicates the "Page X / Y + Previous/Next" block repeated verbatim across 18 pages.
 * Appearance is identical to the existing pages.
 */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const t = useTranslations();
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted">
        {t("admin.shared.pagination.pageInfo", { page, totalPages })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          {t("common.previous")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          {t("admin.shared.pagination.next")}
        </Button>
      </div>
    </div>
  );
}
