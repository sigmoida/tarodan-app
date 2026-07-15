/** @format */

"use client";

import { api, mediaApi, userApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";

export interface ProfileMe {
  displayName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  bio?: string;
  avatarUrl?: string;
  membershipTier?: string;
  companyName?: string;
  taxId?: string;
}

const RESOURCE = "profile-me";
/** The overview query (see queryKeys.profile.overview) also reflects profile edits. */
const OVERVIEW_RESOURCE = "profile";

/** Fresh profile record for the edit form (independent of the overview query). */
export function useProfileInfo(enabled: boolean) {
  const query = useWebList<ProfileMe>({
    resource: RESOURCE,
    fetcher: async () => {
      const res = await userApi.getProfile();
      return res.data?.user || res.data || {};
    },
    enabled,
    query: { meta: { page: "profile-info" } },
  });
  return { profile: query.data, isLoading: query.isLoading };
}

/** Patch the user's personal (+ business) info. */
export function useUpdateProfile() {
  const t = useTranslations();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  return useWebMutation(
    async (data: Record<string, unknown>) => {
      const payload: Record<string, unknown> = { ...data };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === "") payload[k] = undefined;
      });
      delete payload.email;
      await api.patch("/users/me", payload);
    },
    {
      invalidates: [RESOURCE, OVERVIEW_RESOURCE],
      successMessage: t("profile.profileUpdated"),
      errorMessage: t("profile.updateFailed"),
      onSuccess: () => {
        void refreshUser();
      },
    },
  );
}

/** Upload a new avatar → save the S3 key → return a display URL. */
export function useUploadAvatar() {
  const t = useTranslations();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  return useWebMutation(
    async (file: File): Promise<string> => {
      const uploadRes = await mediaApi.uploadAvatar(file);
      const s3Key = uploadRes.data.key;
      const displayUrl = uploadRes.data.url as string | undefined;
      await api.patch("/users/me", { avatarUrl: s3Key });
      return displayUrl || URL.createObjectURL(file);
    },
    {
      invalidates: [RESOURCE],
      successMessage: t("profile.photoUpdated"),
      errorMessage: t("profile.photoUploadFailed"),
      onSuccess: () => {
        void refreshUser();
      },
    },
  );
}
