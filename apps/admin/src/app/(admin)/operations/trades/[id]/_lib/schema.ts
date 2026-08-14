import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Force-cancel a stuck trade — reason needs enough detail to audit later. */
export const forceCancelTradeSchema = (t: T) =>
  z.object({
    reason: z
      .string()
      .trim()
      .min(10, t("admin.operations.trades.cancelReasonMinLen")),
    sendArrivedItemBack: z.boolean(),
  });
export type ForceCancelTradeValues = z.infer<
  ReturnType<typeof forceCancelTradeSchema>
>;

/** Resolve a trade dispute — resolution note needs enough detail to audit later. */
export const resolveDisputeSchema = (t: T) =>
  z.object({
    resolution: z.enum([
      "complete_trade",
      "compensate_initiator",
      "compensate_receiver",
      "compensate_both",
    ]),
    note: z
      .string()
      .trim()
      .min(10, t("admin.operations.trades.resolutionNoteMinLen")),
  });
export type ResolveDisputeValues = z.infer<
  ReturnType<typeof resolveDisputeSchema>
>;
