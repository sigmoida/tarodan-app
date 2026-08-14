import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Release a seller payout (standard or early) — reason is required. */
export const releasePayoutSchema = (t: T) =>
  z.object({
    reason: z
      .string()
      .trim()
      .min(1, t("common.required"))
      .max(500, t("admin.catalog.common.maxChars", { max: 500 })),
  });
export type ReleasePayoutValues = z.infer<
  ReturnType<typeof releasePayoutSchema>
>;
