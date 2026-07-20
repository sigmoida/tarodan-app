"use client";

import { useTranslations } from "next-intl";
import { Pagination, Select } from "@tarodan/ui";
import { useResourceList } from "@/context/ResourceListContext";
import { PAGE_SIZE_OPTIONS } from "./page-size";

/** Page-size options offered by the "Rows per page" selector. */
const SIZE_OPTIONS = PAGE_SIZE_OPTIONS.map((size) => ({
  value: String(size),
  label: String(size),
}));

/** Page controls wired to the list's page state. */
export function ResourceListPagination() {
  const { page, pageSize, setPageSize, total, totalPages, setPage } =
    useResourceList();
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">
          {t("admin.shared.pagination.rowsPerPage")}
        </span>
        <Select
          bare
          selectSize="sm"
          value={String(pageSize)}
          onChange={(e) => setPageSize(Number(e.target.value))}
          options={SIZE_OPTIONS}
        />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-4">
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
      )}
    </div>
  );
}
