"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type {
  ShipmentSimulationResult,
  SimulatableParcel,
  SimulateShipmentPayload,
} from "@/lib/api/system.types";

const RESOURCE = "test-tools-shipments";
const MIN_QUERY_LENGTH = 2;

/**
 * Kargo simülasyonu kartının verisi: arama (sorgu) + taşıyıcı olayı (yazım).
 * Yazım başarılı olunca arama yeniden çekilir — kart kolinin YENİ durumunu ve
 * kalan adımlarını API'den gösterir, kendisi hesaplamaz.
 */
export function useShipmentSimulation() {
  const t = useTranslations();
  const [submitted, setSubmitted] = useState("");
  const enabled = submitted.length >= MIN_QUERY_LENGTH;

  const query = useQuery<SimulatableParcel[]>({
    queryKey: adminKeys.list(RESOURCE, submitted),
    queryFn: async () =>
      (await adminApi.searchSimulatableShipments(submitted)).data,
    enabled,
  });

  const simulate = useAdminMutation(
    (payload: SimulateShipmentPayload) =>
      adminApi
        .simulateShipment(payload)
        .then((r): ShipmentSimulationResult => r.data),
    {
      invalidates: [RESOURCE],
      errorMessage: t("admin.system.testTools.simulation.failed"),
      onSuccess: ({ applied, after }) => {
        if (applied) {
          toast.success(
            t("admin.system.testTools.simulation.applied", {
              reference: after.reference,
              status: after.status ?? "—",
            }),
          );
        } else {
          toast(
            t("admin.system.testTools.simulation.notApplied", {
              reference: after.reference,
            }),
          );
        }
      },
    },
  );

  const search = (raw: string) => {
    const next = raw.trim();
    if (next.length < MIN_QUERY_LENGTH) {
      toast.error(t("admin.system.testTools.minimumCharacters"));
      return;
    }
    if (next === submitted) void query.refetch();
    else setSubmitted(next);
  };

  return {
    parcels: query.data ?? [],
    isSearching: query.isFetching,
    /** Bir arama sonuçlandı (boş sonuç mesajı için). */
    hasSearched: enabled && query.isFetched,
    search,
    simulate,
  };
}
