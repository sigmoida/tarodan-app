import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  TIMING_GROUPS,
  TIMING_RULES,
  describeTimingViolation,
  findTimingInvariantViolation,
  timingRule,
  timingRulesInGroup,
  validateTimingAction,
  validateTimingValue,
  type AdminTimingRuleState,
  type TimingExpiryAction,
  type TimingGroup,
  type TimingRuleChange,
  type TimingRuleId,
  type TimingRuleViolation,
} from "@tarodan/types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Süreler ve Kurallar ekranının saf mantığı. Sınırlar, eylem seçenekleri ve
 * alanlar arası kurallar KAYITTAN (`@tarodan/types` TIMING_RULES) okunur —
 * sunucu aynı fonksiyonlarla doğrular, burada ikinci bir kural yazılmaz.
 *
 * Form alanları düzdür (FormInput hatayı düz adla okur): değer kayıt
 * kimliğinin adında, eylem `<kimlik>Action` adında durur.
 */

export type TimingRulesFormValues = Record<string, string>;

export const valueField = (id: TimingRuleId): string => id;
export const actionField = (id: TimingRuleId): string => `${id}Action`;

/** API yanıtını (zarflı ya da düz) kayıt durumlarına çevirir. */
export function readTimingRuleStates(raw: unknown): AdminTimingRuleState[] {
  const body = raw as
    | { rules?: AdminTimingRuleState[]; data?: { rules?: AdminTimingRuleState[] } }
    | undefined;
  return body?.data?.rules ?? body?.rules ?? [];
}

/** Sunucu durumu → form değerleri (sayılar metin olarak). */
export function toFormValues(
  states: readonly AdminTimingRuleState[],
): TimingRulesFormValues {
  const values: TimingRulesFormValues = {};
  for (const state of states) {
    values[valueField(state.id)] = String(state.value);
    values[actionField(state.id)] = state.action;
  }
  return values;
}

/**
 * Yalnız DEĞİŞEN kayıtlar — her biri kendi denetim satırını yazar, değişmeyen
 * bir kayıt gönderilip "değişti" diye kaydedilmez.
 */
export function changedRules(
  values: TimingRulesFormValues,
  states: readonly AdminTimingRuleState[],
): TimingRuleChange[] {
  const changes: TimingRuleChange[] = [];
  for (const state of states) {
    const change: TimingRuleChange = { id: state.id };
    const rawValue = values[valueField(state.id)]?.trim();
    if (rawValue !== undefined && Number(rawValue) !== state.value) {
      change.value = Number(rawValue);
    }
    const action = values[actionField(state.id)];
    if (action !== undefined && action !== state.action) {
      change.action = action as TimingExpiryAction;
    }
    if (change.value !== undefined || change.action !== undefined) {
      changes.push(change);
    }
  }
  return changes;
}

/** Kayıt ihlalinin metni — API'nin 400 mesajıyla aynı katalog anahtarı. */
function violationMessage(t: T, violation: TimingRuleViolation): string {
  const { key, params } = describeTimingViolation(violation);
  return t(key, params);
}

/**
 * Formun zod şeması. Her değer tam sayı + kayıt sınırları; değişen değerler
 * için alanlar arası kurallar aday küme üzerinde (sunucuyla aynı fonksiyon).
 * Kapalı ("yakında") eylem seçici zaten devre dışıdır; şema yine de reddeder.
 */
export function timingRulesSchema(
  t: T,
  states: readonly AdminTimingRuleState[],
) {
  return z.record(z.string()).superRefine((values, ctx) => {
    const candidate = Object.fromEntries(
      states.map((state) => [state.id, state.value]),
    ) as Record<TimingRuleId, number>;
    const changed: TimingRuleId[] = [];

    for (const state of states) {
      const field = valueField(state.id);
      const raw = values[field]?.trim() ?? "";
      if (raw === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: t("admin.timingRules.validation.required"),
        });
        continue;
      }
      const value = Number(raw);
      const violation = Number.isFinite(value)
        ? validateTimingValue(state.id, value)
        : ({ code: "notInteger" } as const);
      if (violation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: violationMessage(t, violation),
        });
        continue;
      }
      candidate[state.id] = value;
      if (value !== state.value) changed.push(state.id);

      const action = values[actionField(state.id)];
      const actionViolation =
        action === undefined ? null : validateTimingAction(state.id, action);
      if (actionViolation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [actionField(state.id)],
          message: violationMessage(t, actionViolation),
        });
      }
    }

    const crossField = findTimingInvariantViolation(candidate, changed);
    if (crossField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [valueField(crossField.id)],
        message: violationMessage(t, crossField.violation),
      });
    }
  });
}

/** Sekmeler — kayıttaki grup sırası. */
export function timingRuleTabs(t: T): { key: TimingGroup; label: string }[] {
  return TIMING_GROUPS.map((group) => ({
    key: group,
    label: t(`admin.timingRules.groups.${group}`),
  }));
}

export function isTimingGroup(value: string): value is TimingGroup {
  return (TIMING_GROUPS as readonly string[]).includes(value);
}

/** Bir sekmenin satırları, kayıt sırasıyla. */
export const rulesInTab = timingRulesInGroup;

/**
 * Eylem seçenekleri. Henüz yazılmamış davranış "yakında" ekiyle görünür ama
 * seçilemez; tek eylemli kayıtta seçici tamamen devre dışıdır.
 */
export function actionOptions(
  t: T,
  id: TimingRuleId,
): { value: string; label: string; disabled: boolean }[] {
  return TIMING_RULES[id].actions.map((option) => {
    const label = t(`admin.timingRules.actions.${option.action}`);
    return {
      value: option.action,
      label: option.available
        ? label
        : t("admin.timingRules.comingSoon", { action: label }),
      disabled: !option.available,
    };
  });
}

/**
 * Tek eylemli kayıtta seçici devre dışıdır. Sonraki paketlere ayrılmış bir
 * seçeneği olan kayıtta seçici açıktır ama o seçenek "yakında" olarak
 * devre dışı görünür — bayrak çevrilince ekran değişmeden seçilebilir olur.
 */
export function isActionLocked(id: TimingRuleId): boolean {
  return TIMING_RULES[id].actions.length === 1;
}

/** Satırın yardım satırı için sınır metni ("1–30 gün"). */
export function boundsLabel(t: T, id: TimingRuleId): string {
  const rule = timingRule(id);
  return t("admin.timingRules.bounds", {
    min: rule.min,
    max: rule.max,
    unit: t(`admin.timingRules.units.${rule.unit}`),
  });
}
