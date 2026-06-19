"use client";

import { Button } from "@tarodan/ui";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}

/**
 * Admin liste sayfalarının ortak pagination bloğu.
 * 18 sayfada birebir tekrarlanan "Sayfa X / Y + Önceki/Sonraki" bloğunu tekilleştiriyor.
 * Görünüm mevcut sayfalardaki ile birebir aynı.
 */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted">
        Sayfa {page} / {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Önceki
        </Button>
        <Button
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Sonraki
        </Button>
      </div>
    </div>
  );
}
