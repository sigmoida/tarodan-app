import {
  SELLER_TRUST_LEVEL_I18N_KEYS,
  type SellerTrustLabScenarioPreset,
} from "@tarodan/types";
import { fmtDecimal } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";
import { goldenName } from "./scenarioForm";

export interface GoldenRow {
  id: number;
  name: string;
  score: string;
  level: string;
}

/** The approved v1 outcome of each reference scenario, as the table shows it. */
export function goldenRows(
  presets: SellerTrustLabScenarioPreset[],
  t: Translate,
): GoldenRow[] {
  return presets.map((preset) => ({
    id: preset.id,
    name: goldenName(preset.key, t),
    score:
      preset.approved.scoreX100 === null
        ? t("admin.users.detail.trust.notEnoughData")
        : (fmtDecimal(preset.approved.scoreX100 / 100) ?? ""),
    level: t(SELLER_TRUST_LEVEL_I18N_KEYS[preset.approved.level]),
  }));
}
