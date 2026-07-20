"use client";

import { useTranslations } from "next-intl";
import { Pagination } from "@tarodan/ui";
import { useResourceList } from "@/context/ResourceListContext";

/** Page controls wired to the list's page state. */
export function ResourceListPagination() {
  const { page, pageSize, total, totalPages, setPage } = useResourceList();
  const t = useTranslations();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted">
        {t("admin.shared.pagination.pageInfo", { page, totalPages })}
      </p>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
      />
    </div>
  );
}
