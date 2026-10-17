import type { MessageKey } from "@tarodan/i18n";
import type {
  SimulatableParcel,
  SimulatedCarrierStep,
  SimulationTargetKind,
} from "@/lib/api/system.types";

/**
 * Kargo simülasyonu kartının saf yardımcıları: etiket anahtarları ve satır
 * kimliği. Hangi adımın sunulacağına API karar verir (`nextSteps`); burada
 * yeniden hesaplanmaz.
 */

const SIM = "admin.system.testTools.simulation";

export function simulationKindKey(kind: SimulationTargetKind): MessageKey {
  return `${SIM}.kinds.${kind}`;
}

/** Adım etiketi türe göre değişir: iade kolisinin teslimi "satıcıya" teslimdir. */
export function simulationStepKey(
  kind: SimulationTargetKind,
  step: SimulatedCarrierStep,
): MessageKey {
  return `${SIM}.steps.${kind}.${step}`;
}

const TRADE_LEGS = ["to_warehouse", "from_warehouse", "return"] as const;
type TradeLeg = (typeof TRADE_LEGS)[number];

const isTradeLeg = (leg: string): leg is TradeLeg =>
  (TRADE_LEGS as readonly string[]).includes(leg);

/** Takas bacağının yönü; bilinmeyen/boş bacakta etiket yok. */
export function simulationLegKey(leg: string | null): MessageKey | null {
  return leg && isTradeLeg(leg) ? `${SIM}.legs.${leg}` : null;
}

/** Aynı kimlik farklı tablolardan gelebilir; satır anahtarı türle birlikte. */
export function simulationRowId(
  parcel: Pick<SimulatableParcel, "kind" | "id">,
): string {
  return `${parcel.kind}:${parcel.id}`;
}
