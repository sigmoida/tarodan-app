"use client";

import { Button } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import { useListings } from "../_context/ListingsContext";

export default function ListingsPagination() {
  const t = useTranslations();
  const locale = useLocale();
  const { pagination, setCurrentPage } = useListings();

  if (pagination.totalPages <= 1) return null;

  return (
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-elevated rounded border border-border px-4 py-4">
      <div className="text-sm text-muted">
        {locale === "en"
          ? `Showing ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} products`
          : `${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} / ${pagination.total} ürün gösteriliyor`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setCurrentPage(pagination.page - 1)}
          disabled={pagination.page === 1}
          className="px-4 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface font-medium text-body"
        >
          {t("common.previous")}
        </Button>
        <div className="flex items-center gap-1">
          {Array.from(
            { length: Math.min(5, pagination.totalPages) },
            (_, i) => {
              let pageNum: number;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              return (
                <Button
                  variant="secondary"
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium ${
                    pagination.page === pageNum
                      ? "bg-primary-500 text-inverted"
                      : "border border-border text-body hover:bg-surface"
                  }`}
                >
                  {pageNum}
                </Button>
              );
            },
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => setCurrentPage(pagination.page + 1)}
          disabled={pagination.page >= pagination.totalPages}
          className="px-4 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface font-medium text-body"
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
