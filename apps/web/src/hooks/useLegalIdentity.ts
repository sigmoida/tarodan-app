"use client";

import { useTranslations } from "next-intl";
import type {
  LegalIdentityStatus,
  SubmitLegalIdentityRequest,
} from "@tarodan/types";
import { legalIdentityApi } from "@/lib/api";
import { requiredStepState } from "@/lib/requiredSteps";
import { useAuthStore } from "@/stores/authStore";
import { useWebList } from "./useWebResource";
import { useWebMutation } from "./useWebMutation";

/** Kapı ve profil bölümü aynı kaynağı okur: gönderim ikisini de tazeler. */
const RESOURCE = "legal-identity";

/**
 * Üyenin yasal kimlik durumu: eksik alanlar (sunucu hesaplar — personel ve
 * test hesabı muaf), salt-okunur ad-soyad ve maskeli TCKN. Misafirde sorgu
 * çalışmaz. `state`, zorunlu adımların sırası için (`RequiredStepsGate`).
 */
export function useLegalIdentity() {
  const t = useTranslations();
  const { isAuthenticated, isLoading } = useAuthStore();
  const enabled = isAuthenticated && !isLoading;

  const query = useWebList<LegalIdentityStatus>({
    resource: RESOURCE,
    fetcher: async () => (await legalIdentityApi.getStatus()).data,
    enabled,
  });

  const submit = useWebMutation(
    (body: SubmitLegalIdentityRequest) => legalIdentityApi.submit(body),
    { invalidates: [RESOURCE], successMessage: t("identity.gate.saved") },
  );

  const status = enabled ? (query.data ?? null) : null;
  const state = requiredStepState({
    enabled,
    isPending: query.isPending,
    needed: (status?.missing.length ?? 0) > 0,
  });

  return { status, submit, state, isLoading: enabled && query.isPending };
}
