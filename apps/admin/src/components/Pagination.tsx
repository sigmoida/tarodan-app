"use client";

import { useTranslations } from "next-intl";
import { Pagination as UiPagination } from "@tarodan/ui";

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
      <UiPagination
        page={page}
        pageSize={1}
        total={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
