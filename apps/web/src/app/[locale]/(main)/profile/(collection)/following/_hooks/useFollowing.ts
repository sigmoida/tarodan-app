/** @format */

"use client";

import { api } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { FollowedUser } from "../_lib/types";
import { useTranslations } from "next-intl";

const RESOURCE = "profile-following";

/** Sellers the current user follows. */
export function useFollowing(enabled: boolean) {
  const query = useWebList<FollowedUser[]>({
    resource: RESOURCE,
    fetcher: async () => {
      const response = await api.get("/users/me/following");
      const data =
        response.data.data || response.data.following || response.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled,
    query: { meta: { page: "profile-following" } },
  });
  return { following: query.data ?? [], isLoading: query.isLoading };
}

/** Unfollow a seller — owns toast + the follow/seller invalidations. */
export function useUnfollow() {
  const t = useTranslations();
  return useWebMutation(
    (userId: string) => api.delete(`/users/${userId}/follow`),
    {
      invalidates: [RESOURCE, "follow", "seller"],
      successMessage: t("page.following.usefollowing.takipBirakildi"),
      errorMessage: t("page.following.usefollowing.takipBirakilamadi"),
    },
  );
}
