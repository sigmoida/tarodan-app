/** @format */

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AtSymbolIcon } from "@heroicons/react/24/outline";
import { Button, Input } from "@tarodan/ui";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useProfile } from "../_context/ProfileContext";

/**
 * Profil kullanıcı adı — "Profil Bilgileri" formunun bir alanı.
 *
 * Kendi ayrı sayfası vardı (`/profile/username`); tek bir alan için bir rota ve
 * bir gezinme satırı taşımanın karşılığı yoktu. Buraya taşındı.
 *
 * Ayrı bir mutasyonu var, formun `Kaydet` düğmesine bağlanmadı: kullanıcı adı
 * ayrı bir uçtan (`PATCH /users/me/username`) ve BİR KEZ talep edilir; diğer
 * alanlarla birlikte gönderilse her kayıtta yeniden talep edilmeye çalışılırdı.
 *
 * Bir kez belirlendikten sonra değiştirilemez — o durumda salt okunur gösterilir
 * (e-posta satırıyla aynı biçim).
 */
export default function UsernameField() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const [username, setUsername] = useState("");

  const claimed = Boolean(profile?.usernameClaimedAt);

  const claim = useMutation({
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

  if (claimed) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-heading">
          {t("auth.username")}
        </label>
        <div className="flex h-10 items-center truncate rounded-lg border border-border bg-surface px-3 text-sm text-muted">
          @{profile?.username}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {t("auth.usernameImmutableHint")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-heading">
        {t("auth.username")}
      </label>
      <div className="flex items-start gap-2">
        <Input
          value={username}
          onChange={(event) =>
            setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))
          }
          placeholder={t("auth.usernamePlaceholder")}
          helperText={t("auth.usernameImmutableHint")}
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9](?:[a-z0-9._]*[a-z0-9])?"
          leftAdornment={<AtSymbolIcon className="h-4 w-4" />}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => claim.mutate()}
          isLoading={claim.isPending}
          disabled={username.length < 3}
          className="mt-0.5 flex-shrink-0"
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
