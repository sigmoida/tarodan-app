"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import type { CommissionRule } from "../_lib/types";

/**
 * `?ruleId=…` derin bağlantısı: sipariş dosyasındaki "komisyon kuralı" satırı
 * buraya götürür ve o kuralın dialogu KENDİLİĞİNDEN açılır — admin, siparişin
 * hangi kurala düştüğünü listede aramak zorunda kalmaz.
 *
 * Kural, ekrandaki listeden okunamaz: liste bellekte sayfalandığı için aranan
 * kural başka bir sayfada olabilir. Bu yüzden yalnız derin bağlantı varken kural
 * seti bir kez çekilir. Açıldıktan sonra parametre URL'den düşürülür; kalsaydı
 * dialog her kapatılışta yeniden açılırdı.
 *
 * `useSearchParams` kullandığı için `ResourceList`in Suspense sınırının İÇİNDE
 * render edilmelidir.
 */
export function CommissionRuleDeepLink({
  onOpen,
}: {
  onOpen: (rule: CommissionRule) => void;
}) {
  const t = useTranslations();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ruleId = params.get("ruleId");
  const handled = useRef<string | null>(null);

  const { data, isError } = useQuery({
    // Sipariş ve takas bağlantıları tarihsel kural kimliğini taşır. Güncel
    // DRAFT/ACTIVE listesini çözmek bu kimliği yanlış sete yönlendirebilir.
    queryKey: ["commission-rules", "detail", ruleId],
    queryFn: () => adminApi.getCommissionRule(ruleId!).then((res) => res.data),
    enabled: !!ruleId,
    retry: false,
  });

  useEffect(() => {
    if (!ruleId || !data || handled.current === ruleId) return;
    handled.current = ruleId;

    onOpen(data);

    const next = new URLSearchParams(params.toString());
    next.delete("ruleId");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [ruleId, data, onOpen, params, pathname, router, t]);

  useEffect(() => {
    if (!ruleId || !isError || handled.current === ruleId) return;
    handled.current = ruleId;
    toast.error(t("admin.finance.commission.ruleNotFound"));

    const next = new URLSearchParams(params.toString());
    next.delete("ruleId");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [ruleId, isError, params, pathname, router, t]);

  return null;
}
