"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { FormSearchableMultiSelect } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface UserRow {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string;
}

const MIN_QUERY = 2;

/**
 * "Belirli kullanıcılar" hedefi için kullanıcı adı aramalı ÇOKLU seçim —
 * UUID yapıştırma yerine username/ad/e-posta ile arayıp çip olarak toplar.
 * Form alanı `users`: {value: userId, label} dizisi (bkz. sendNotificationSchema).
 */
export function UserPicker() {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim());

  const enabled = debounced.length >= MIN_QUERY;
  const { data, isFetching } = useQuery({
    queryKey: adminKeys.list("notification-user-search", debounced),
    queryFn: async () =>
      (await adminApi.getUsers({ search: debounced, page: 1, limit: 10 }))
        .data as { data?: UserRow[] },
    enabled,
  });

  const options = (data?.data ?? []).map((user) => ({
    value: user.id,
    label: user.username
      ? `@${user.username}${user.displayName ? ` · ${user.displayName}` : ""}`
      : user.displayName || user.email,
  }));

  return (
    <FormSearchableMultiSelect
      name="users"
      label={t("admin.marketing.notifications.target.specificUsers")}
      placeholder={t("admin.marketing.notifications.userSearchPlaceholder")}
      searchPlaceholder={t(
        "admin.marketing.notifications.userSearchPlaceholder",
      )}
      options={options}
      onQueryChange={setQuery}
      loading={isFetching}
      loadingText={t("common.loading")}
      emptyText={
        enabled
          ? t("admin.marketing.notifications.userSearchEmpty")
          : t("admin.marketing.notifications.userSearchHint")
      }
    />
  );
}
