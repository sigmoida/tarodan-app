/** @format */

"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { membershipApi } from "@/lib/api";
import {
  MEMBERSHIP_SETTLE_ATTEMPTS,
  MEMBERSHIP_SETTLE_INTERVAL_MS,
  isMembershipSettled,
} from "@/lib/membershipSettle";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";

/**
 * Satın alma / değişiklik sonrası üyelik sorgularını SUNUCU yansıtana kadar
 * tazeler. Tek seferlik bir tazeleme yetmez: PayTR dönüşünde sayfaya ödeme
 * doğrulanmadan gelinir, katman biraz sonra değişir ve eski `isAdFree`
 * (`limits`, staleTime 5 dk) önbellekte kalırdı.
 *
 * Her turda `me` + `limits` doğrudan okunur, limitler önbelleğe yazılır
 * (reklam yuvaları anında uyar) ve katman değiştiyse durulur; en çok
 * `MEMBERSHIP_SETTLE_ATTEMPTS` kez, `MEMBERSHIP_SETTLE_INTERVAL_MS` arayla.
 * `skipWait`: ertelemeli düşürmede katman dönem sonuna dek değişmez — bekleme yok,
 * tek tur.
 */
export function useMembershipSettle(options: {
  expectedTier?: string | null;
  skipWait?: boolean;
}) {
  const queryClient = useQueryClient();
  const { expectedTier = null, skipWait = false } = options;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Önceki katman: bu sayfaya gelmeden önceki önbellek, yoksa oturum bilgisi.
    const cachedMe = queryClient.getQueryData<{ tier?: unknown } | null>(
      queryKeys.membership.me(),
    );
    const cachedTier =
      typeof cachedMe?.tier === "string" ? cachedMe.tier : undefined;
    const baselineTier =
      cachedTier ?? useAuthStore.getState().user?.membershipTier ?? null;

    const run = async (attempt: number) => {
      if (cancelled) return;
      let settled = false;
      try {
        const [me, limits] = await Promise.all([
          membershipApi.getCurrentMembership(),
          membershipApi.getLimits(),
        ]);
        if (cancelled) return;
        queryClient.setQueryData(queryKeys.membership.limits(), {
          isAdFree: limits.data?.isAdFree === true,
        });
        // Diğer tüketiciler (üyelik sayfası) kendi biçimlerinde yeniden okur.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.membership.me(),
        });
        settled =
          skipWait ||
          isMembershipSettled({
            tier: me.data?.tier?.type,
            expectedTier,
            baselineTier,
          });
      } catch {
        // Geçici hata: sonraki turda tekrar dene.
      }
      if (settled || attempt + 1 >= MEMBERSHIP_SETTLE_ATTEMPTS) return;
      timer = setTimeout(
        () => void run(attempt + 1),
        MEMBERSHIP_SETTLE_INTERVAL_MS,
      );
    };

    void run(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [queryClient, expectedTier, skipWait]);
}
