"use client";

import { activeRequiredStep } from "@/lib/requiredSteps";
import { useLegalIdentity } from "./useLegalIdentity";
import { usePendingConsents } from "./usePendingConsents";

/**
 * Zorunlu adımların tek durum kaynağı: her adımın verisi + şu an gösterilecek
 * TEK adım. Kapı (`RequiredStepsGate`) bunu çizer; kapatılabilir hatırlatmalar
 * (ör. satıcı adres uyarısı) `active` doluyken susar ki zorunlu pencerenin
 * üstüne binmesinler. Sorgular TanStack önbelleğinden paylaşılır.
 */
export function useRequiredSteps() {
  const consents = usePendingConsents();
  const identity = useLegalIdentity();
  const active = activeRequiredStep({
    consents: consents.state,
    legalIdentity: identity.state,
  });
  return { active, consents, identity };
}
