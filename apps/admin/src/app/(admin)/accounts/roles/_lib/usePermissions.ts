"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";

/**
 * Role → permission list matrix (`['role-permissions']`). Used by both the matrix tab
 * (which seeds its editable copy from here) and the user assignments tab (permission count +
 * role preview); React Query shares it via the single queryKey.
 *
 * A load failure is surfaced as a QUERY ERROR rather than swallowed behind a
 * local copy of the defaults: the previous fallback rendered a matrix that did
 * not match the server, and Save would then have PERSISTED that wrong matrix.
 * Callers render an error state instead (and editing stays blocked).
 */
export function usePermissionsQuery() {
  return useQuery({
    queryKey: adminKeys.all("role-permissions"),
    queryFn: async () =>
      ((await adminApi.getRolePermissions()).data ?? {}) as Record<
        string,
        string[]
      >,
  });
}
