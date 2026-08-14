import { z } from "zod";
import type { useTranslations } from "next-intl";
import { reasonField } from "@/lib/schemas/common";

type T = ReturnType<typeof useTranslations<never>>;

/** Release a seller payout (standard or early) — reason is required. */
export const releasePayoutSchema = (t: T) =>
  z.object({
    reason: reasonField(t),
  });
export type ReleasePayoutValues = z.infer<
  ReturnType<typeof releasePayoutSchema>
>;
