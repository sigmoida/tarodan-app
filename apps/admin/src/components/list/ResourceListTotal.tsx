'use client';

import { useResourceList } from './context';

/** A "Toplam N <unit>" line — handy under tab tables where the total isn't in a header. */
export function ResourceListTotal({ unit }: { unit: string }) {
  const { total } = useResourceList();
  return (
    <p className="text-sm text-muted">
      Toplam {total} {unit}
    </p>
  );
}
