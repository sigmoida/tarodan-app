/** @format */

"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import ConsentGate from "@/components/legal/ConsentGate";
import LegalIdentityGate from "@/components/identity/LegalIdentityGate";
import { useRequiredSteps } from "@/hooks/useRequiredSteps";
import { useRequiredStepsStore } from "@/stores/requiredStepsStore";
import {
  isRequiredStepExemptPath,
  type RequiredStep,
} from "@/lib/requiredSteps";

/**
 * Zorunlu adımların TEK montaj noktası. Girişten sonra üyenin tamamlaması
 * gereken adımlar (`REQUIRED_STEPS` sırasıyla: sözleşme onayları, yasal kimlik)
 * burada sırayla, HER SEFERİNDE YALNIZ BİRİ gösterilir — pencereler üst üste
 * binmez. Biri tamamlanınca sorgusu tazelenir ve sıradaki açılır.
 *
 * Zorlama yalnız istemcidedir: sunucu bekleyen adımı olan üyenin isteklerini
 * reddetmez (bugünkü mobil sürümler kilitlenmesin diye). Yasal metin sayfaları
 * muaftır ki üye onaylayacağı metni okuyabilsin.
 */
export default function RequiredStepsGate() {
  const pathname = usePathname();
  const { active, outstanding, consents, identity } = useRequiredSteps();
  const setOutstanding = useRequiredStepsStore((s) => s.setOutstanding);

  // Kök düzendeki çerez bandı (sorgu sağlayıcısının dışında) bu bilgiyi
  // mağazadan okur; kapı sayfadan kalkınca bekleyen bir şey kalmaz.
  useEffect(() => {
    setOutstanding(outstanding);
  }, [outstanding, setOutstanding]);
  useEffect(() => () => setOutstanding(false), [setOutstanding]);

  if (!active || isRequiredStepExemptPath(pathname)) return null;

  // Record: yeni bir adım `REQUIRED_STEPS`e eklenince burada görünümü
  // yazılmadan derleme geçmez.
  const views: Record<RequiredStep, () => ReactNode> = {
    consents: () => (
      <ConsentGate pending={consents.pending} accept={consents.accept} />
    ),
    legalIdentity: () =>
      identity.status ? (
        <LegalIdentityGate
          // Eksik alan kümesi değişirse (kısmi kayıt) form baştan kurulsun.
          key={identity.status.missing.join(",")}
          status={identity.status}
          submit={identity.submit}
        />
      ) : null,
  };

  return <>{views[active]()}</>;
}
