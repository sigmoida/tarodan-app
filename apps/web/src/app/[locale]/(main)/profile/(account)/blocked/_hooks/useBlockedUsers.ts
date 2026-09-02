"use client";

import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/** Engellediğim kullanıcılar (`GET /users/me/blocked`). */
export function useBlockedUsers(enabled: boolean) {
  const query = useQuery({
    queryKey: queryKeys.blocks.list(),
    queryFn: async () => {
      const response = await userApi.getBlockedUsers();
      const data = Array.isArray(response.data) ? response.data : [];
      return data;
    },
    enabled,
    meta: { page: "profile-blocked" },
  });
  return { blocked: query.data ?? [], isLoading: query.isLoading };
}
