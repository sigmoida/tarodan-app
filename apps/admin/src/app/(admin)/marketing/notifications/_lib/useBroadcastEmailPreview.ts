"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { EmailPreviewData } from "@/components/email/EmailPreviewPane";
import { audienceFromForm, type SendForm } from "./types";

const PREVIEW_DEBOUNCE_MS = 800;
const AUDIENCE_DEBOUNCE_MS = 500;

/**
 * Nesne girdisini debounce eder. `useDebouncedValue` değerin REFERANSINA bağlı:
 * her render'da yeni nesne verilirse zamanlayıcı sürekli sıfırlanır ve değer
 * hiç güncellenmez. Bu yüzden girdi serileştirilip string (primitif) olarak
 * debounce edilir; içerik değişmedikçe state yazılmaz, gereksiz render olmaz.
 */
export function useDebouncedObject<T>(value: T, delayMs: number): T {
  const key = useDebouncedValue(JSON.stringify(value), delayMs);
  return useMemo(() => JSON.parse(key) as T, [key]);
}

/**
 * E-posta önizlemesi: HTML'i SUNUCU render eder (süzme + ortak iskelet +
 * pazarlamada çıkış linki), böylece görünen gerçekte gidenle aynıdır. Yazarken
 * her tuşta istek atmamak için girdi debounce edilir.
 */
export function useBroadcastEmailPreview(values: SendForm) {
  const draft = useDebouncedObject(
    {
      title: values.title,
      body: values.body,
      emailSubject: values.emailSubject,
      emailHtml: values.emailHtml,
      mailingType: values.mailingType,
    },
    PREVIEW_DEBOUNCE_MS,
  );
  // Debounce edilmiş taslağa bakılır: yazılan HTML henüz taslağa girmediyse
  // eski (boş) taslakla istek atılmaz.
  const enabled =
    values.channels.includes("email") && draft.emailHtml.trim().length > 0;

  const query = useQuery({
    queryKey: adminKeys.preview("notification-email", draft),
    queryFn: async () =>
      (await adminApi.previewBroadcastEmail(draft)).data as EmailPreviewData,
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });

  return {
    preview: query.data,
    isPending: query.isFetching,
    error: query.isError ? query.error : undefined,
    refetch: () => void query.refetch(),
  };
}

export interface AudienceCounts {
  total: number;
  marketing: number;
}

/**
 * Seçili hedefin toplam / pazarlama-izinli alıcı sayısı. Duyuru herkese,
 * pazarlama yalnız izinlilere gider; yönetici seçimini bu sayıya bakarak yapar.
 * Hedef henüz belirsizse (kullanıcı seçilmedi) sorgu atılmaz.
 */
export function useAudienceCounts(values: SendForm) {
  const audience = useDebouncedObject(
    audienceFromForm(values),
    AUDIENCE_DEBOUNCE_MS,
  );
  const ready =
    values.channels.includes("email") &&
    (audience.targetType !== "user_ids" || (audience.userIds?.length ?? 0) > 0);

  const query = useQuery({
    queryKey: adminKeys.preview("notification-audience", audience),
    queryFn: async () =>
      (await adminApi.countNotificationAudience(audience))
        .data as AudienceCounts,
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });

  return query.data;
}
