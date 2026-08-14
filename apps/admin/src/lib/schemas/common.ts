import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** A trimmed, required reason/note field capped at 500 chars. */
export function reasonField(t: T) {
  return z
    .string()
    .trim()
    .min(1, t("common.required"))
    .max(500, t("admin.catalog.common.maxChars", { max: 500 }));
}

/** Same as {@link reasonField}, but optional (blank is allowed). */
export function optionalReasonField(t: T) {
  return z
    .string()
    .trim()
    .max(500, t("admin.catalog.common.maxChars", { max: 500 }))
    .optional();
}
