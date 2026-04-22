import React from 'react';
import { cn } from './utils';
import { IconButton } from './IconButton';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** How many numbered buttons to show (default 5). */
  siblingCount?: number;
  className?: string;
}

const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i);

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  siblingCount = 1,
  className,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const firstPage = 1;
  const lastPage = totalPages;
  const leftSibling = Math.max(firstPage, page - siblingCount);
  const rightSibling = Math.min(lastPage, page + siblingCount);

  const pages: (number | 'ellipsis-left' | 'ellipsis-right')[] = [];
  pages.push(firstPage);
  if (leftSibling > firstPage + 1) pages.push('ellipsis-left');
  range(Math.max(firstPage + 1, leftSibling), Math.min(lastPage - 1, rightSibling)).forEach((p) =>
    pages.push(p),
  );
  if (rightSibling < lastPage - 1) pages.push('ellipsis-right');
  if (lastPage !== firstPage) pages.push(lastPage);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-1', className)}
    >
      <IconButton
        aria-label="Previous page"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </IconButton>
      {pages.map((p, i) =>
        typeof p === 'number' ? (
          <button
            key={`${p}-${i}`}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'h-8 min-w-[2rem] rounded-md px-2 text-sm font-medium transition-colors',
              p === page
                ? 'bg-primary-600 text-inverted hover:bg-primary-700'
                : 'text-body hover:bg-surface-alt',
            )}
          >
            {p}
          </button>
        ) : (
          <span
            key={`${p}-${i}`}
            className="inline-flex h-8 min-w-[2rem] items-center justify-center text-subtle"
            aria-hidden="true"
          >
            …
          </span>
        ),
      )}
      <IconButton
        aria-label="Next page"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </IconButton>
    </nav>
  );
};
