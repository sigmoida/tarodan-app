"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AtSymbolIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button, Input } from "@tarodan/ui";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useProfile } from "../../_context/ProfileContext";

export default function UsernamePage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const [username, setUsername] = useState("");
  const claimed = Boolean(profile?.usernameClaimedAt);
  const currentUsername = profile?.username;

  const mutation = useMutation({
    mutationFn: () => userApi.claimUsername(username.trim().toLowerCase()),
    onSuccess: async () => {
      toast.success(t("profile.usernameSaved"));
      await Promise.all([
        refreshUser(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile.overview(),
        }),
      ]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t("common.error"));
    },
  });

  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="border-b border-border-subtle pb-5">
        <div className="flex items-center gap-3">
          <AtSymbolIcon className="h-7 w-7 text-primary-600" />
          <h1 className="text-xl font-semibold text-heading">
            {t("profile.usernameSetupTitle")}
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted">
          {t("profile.usernameSetupDescription")}
        </p>
      </div>

      {claimed ? (
        <div className="mt-6 flex items-center gap-3 border border-success-200 bg-success-50 p-4 text-success-800">
          <CheckCircleIcon className="h-6 w-6 flex-shrink-0" />
          <div>
            <p className="font-medium">{t("profile.usernameAlreadySet")}</p>
            <p className="text-sm">@{currentUsername}</p>
          </div>
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Input
            label={t("auth.username")}
            value={username}
            onChange={(event) =>
              setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))
            }
            placeholder={t("auth.usernamePlaceholder")}
            helperText={t("auth.usernameImmutableHint")}
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9](?:[a-z0-9._]*[a-z0-9])?"
            required
            leftAdornment={<AtSymbolIcon className="h-4 w-4" />}
          />
          <Button
            type="submit"
            isLoading={mutation.isPending}
            disabled={username.length < 3}
          >
            {t("common.save")}
          </Button>
        </form>
      )}
    </section>
  );
}
