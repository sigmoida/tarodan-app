export interface CronDef {
  key: string;
  label: string;
  description: string;
}

export interface SearchItem {
  id: string;
  label: string;
  status?: string;
  dates: Record<string, string | null>;
}

export interface TestEnv {
  env: string;
  isProd: boolean;
}

export type AdjustAction = "expire_now" | "set_minutes" | "backdate_days";

export const testToolTypes = (
  t: T,
): { value: string; label: string; placeholder: string }[] => [
  {
    value: "boost",
    label: t("admin.system.testTools.types.boost"),
    placeholder: t("admin.system.testTools.placeholders.product"),
  },
  {
    value: "membership",
    label: t("admin.system.testTools.types.membership"),
    placeholder: t("admin.system.testTools.placeholders.user"),
  },
  {
    value: "refund",
    label: t("admin.system.testTools.types.refund"),
    placeholder: t("admin.system.testTools.placeholders.refund"),
  },
  {
    value: "order",
    label: t("admin.system.testTools.types.order"),
    placeholder: t("admin.system.testTools.placeholders.order"),
  },
  {
    value: "offer",
    label: t("admin.system.testTools.types.offer"),
    placeholder: t("admin.system.testTools.placeholders.offer"),
  },
  {
    value: "trade",
    label: t("admin.system.testTools.types.trade"),
    placeholder: t("admin.system.testTools.placeholders.trade"),
  },
  {
    value: "hold",
    label: t("admin.system.testTools.types.hold"),
    placeholder: t("admin.system.testTools.placeholders.order"),
  },
  {
    value: "email_verification",
    label: t("admin.system.testTools.types.emailVerification"),
    placeholder: t("admin.system.testTools.placeholders.userEmail"),
  },
  {
    value: "password_reset",
    label: t("admin.system.testTools.types.passwordReset"),
    placeholder: t("admin.system.testTools.placeholders.userEmail"),
  },
];

export const typeOptions = (t: T) =>
  testToolTypes(t).map((type) => ({ value: type.value, label: type.label }));

/** Absolute + relative rendering of a stored timestamp. */
export function fmt(iso: string | null, t: T): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  const rel =
    mins === 0
      ? t("admin.system.testTools.now")
      : mins > 0
        ? t("admin.system.testTools.minutesAfter", { count: mins })
        : t("admin.system.testTools.minutesBefore", { count: -mins });
  return `${d.toLocaleString(t("common.dateLocale"))} (${rel})`;
}

/** Preview the new timestamp an adjust action would produce. */
export function previewAfter(action: AdjustAction, value: number): string {
  const now = Date.now();
  if (action === "expire_now") return new Date(now).toISOString();
  if (action === "set_minutes")
    return new Date(now + value * 60000).toISOString();
  return new Date(now - value * 86400000).toISOString();
}
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;
