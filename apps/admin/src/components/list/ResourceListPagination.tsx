'use client';

import { Pagination } from '@/components/Pagination';
import { useResourceList } from '@/context/ResourceListContext';

/** Page controls wired to the list's page state. */
export function ResourceListPagination() {
  const { page, totalPages, setPage } = useResourceList();
  return <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />;
}
