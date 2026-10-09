"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type {
  StartUatRefreshPayload,
  UatRefreshStatus,
} from "@/lib/api/system.types";
import { uatRefreshPhase, uatRefreshPollInterval } from "./uatRefresh";

const RESOURCE = "test-tools-uat-refresh";

/**
 * "Staging verisi" kartının verisi: durum sorgusu + başlatma yazımı.
 *
 * Yoklama yalnız çalışma sürerken (ya da takas yüzünden API'ye ulaşılamazken)
 * 10 sn'de bir döner; karar `uatRefreshPollInterval`'dadır. Takas sırasındaki
 * ağ hataları hata sayılmaz — `phase` "swapping" olur, react-query son başarılı
 * veriyi tutmaya devam eder ve yoklama API dönene kadar sürer.
 */
export function useUatRefresh() {
  const t = useTranslations();

  const query = useQuery<UatRefreshStatus>({
    queryKey: adminKeys.all(RESOURCE),
    queryFn: async () => (await adminApi.getUatRefreshStatus()).data,
    refetchInterval: (q) => uatRefreshPollInterval(q.state.data, q.state.error),
    // Takasta yeniden deneme gecikmesi yoklamayı geciktirmesin.
    retry: false,
  });

  const start = useAdminMutation(
    (payload: StartUatRefreshPayload) =>
      adminApi.startUatRefresh(payload).then((r) => r.data),
    {
      invalidates: [RESOURCE],
      errorMessage: t("admin.system.testTools.uatRefresh.startFailed"),
      onSuccess: () =>
        toast.success(t("admin.system.testTools.uatRefresh.started")),
    },
  );

  return {
    status: query.data,
    phase: uatRefreshPhase(query.data, query.error),
    isRefetching: query.isRefetching,
    refetch: () => void query.refetch(),
    start,
  };
}
