import type { PublicTimingPolicy } from "@tarodan/types";
import { api } from "./client";

/**
 * Herkese açık politika süreleri (iade penceresi, teklif geçerliliği, ilan
 * ömrü…). Değerler admin "Süreler ve Kurallar" ekranından gelir; ön yüz sabit
 * kopya tutmaz (bkz. `lib/timing-policy.ts`).
 */
export const timingRulesApi = {
  getPolicy: () => api.get<PublicTimingPolicy>("/timing-rules"),
};
