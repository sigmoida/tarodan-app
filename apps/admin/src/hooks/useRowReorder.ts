"use client";

import { useResourceList } from "@/context/ResourceListContext";
import { moveId } from "@/lib/reorder";
import { useAdminMutation } from "./useAdminMutation";

/**
 * `displayOrder` ile sıralanan bir `ResourceList`'te yukarı/aşağı taşıma.
 * Liste tam yüklenir (sayfalama yok), bu yüzden `rows` tüm sıradır; yeni sıra
 * `{ ids }` olarak sıralama ucuna gider ve liste kendiliğinden tazelenir.
 */
export function useRowReorder<T extends { id: string }>(
  resource: string,
  reorder: (ids: string[]) => Promise<unknown>,
) {
  const { rows } = useResourceList<T>();
  const mutation = useAdminMutation(reorder, { invalidates: [resource] });
  return {
    onMove: (row: T, delta: -1 | 1) =>
      mutation.mutate(
        moveId(
          rows.map((r) => r.id),
          row.id,
          delta,
        ),
      ),
    positionOf: (row: T) => ({
      index: rows.findIndex((r) => r.id === row.id),
      total: rows.length,
    }),
    moving: mutation.isPending,
  };
}
