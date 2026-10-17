"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import type { MailAreaId, MailAreaUpdate } from "@/lib/api/mail-routing.types";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useTabParam } from "@/hooks/useTabParam";
import { useSession } from "@/context/SessionContext";
import { readMailRoutingState, type PersonChangePlan } from "./mail-routing";

export const MAIL_ROUTING_RESOURCE = "mail-routing";

export const MAIL_ROUTING_TABS = [
  "accounts",
  "areas",
  "notifications",
] as const;
export type MailRoutingTab = (typeof MAIL_ROUTING_TABS)[number];

const isTab = (value: string): value is MailRoutingTab =>
  (MAIL_ROUTING_TABS as readonly string[]).includes(value);

async function fetchMailRouting() {
  const response = await adminApi.getMailRouting();
  return readMailRoutingState(response.data);
}

/**
 * Tek GET bütün ekranı yükler (hesaplar + alanlar). Değiştirme yalnız
 * super_admin'e açıktır (API de aynısını ister); diğer roller salt okur.
 */
export function useMailRoutingPage() {
  const t = useTranslations();
  const { user } = useSession();
  const canEdit = user.role === "super_admin";
  const [tab, setTab] = useTabParam("accounts");

  const query = useQuery({
    queryKey: adminKeys.all(MAIL_ROUTING_RESOURCE),
    queryFn: fetchMailRouting,
  });

  const tabs = MAIL_ROUTING_TABS.map((key) => ({
    key,
    label: t(`admin.mailRouting.tabs.${key}`),
  }));

  return {
    t,
    canEdit,
    tab: isTab(tab) ? tab : "accounts",
    setTab,
    tabs,
    query,
    state: query.data,
  };
}

/**
 * Alan başına PATCH — gönderen eşlemesi ve iç bildirimler aynı uçtan geçer.
 * Başarıda tek sorgu tazelenir; sekmeler aynı veriyi okur.
 */
export function useAreaUpdate(options: { onSuccess?: () => void } = {}) {
  const t = useTranslations();
  return useAdminMutation(
    ({ areaId, update }: { areaId: MailAreaId; update: MailAreaUpdate }) =>
      adminApi.updateMailArea(areaId, update),
    {
      invalidates: [MAIL_ROUTING_RESOURCE],
      successMessage: t("admin.mailRouting.saved"),
      onSuccess: options.onSuccess,
    },
  );
}

/**
 * Kişi bazlı değişiklik: planın her alanı için bir PATCH. Biri düşse bile
 * diğerleri gitmiş olabilir; bu yüzden başarı ya da hata fark etmeksizin
 * sorgu tazelenir ve ekran gerçek durumu gösterir.
 */
export function usePersonChange(options: { onSuccess?: () => void } = {}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  return useAdminMutation(
    async (plan: PersonChangePlan) => {
      const results = await Promise.allSettled(
        plan.updates.map(({ areaId, update }) =>
          adminApi.updateMailArea(areaId, update),
        ),
      );
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failed) throw failed.reason;
    },
    {
      invalidates: [MAIL_ROUTING_RESOURCE],
      successMessage: t("admin.mailRouting.saved"),
      onSuccess: options.onSuccess,
      mutation: {
        onSettled: () =>
          queryClient.invalidateQueries({
            queryKey: adminKeys.all(MAIL_ROUTING_RESOURCE),
          }),
      },
    },
  );
}
