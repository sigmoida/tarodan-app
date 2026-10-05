import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  ADMIN_CANCEL_NOTE_MAX,
  isAdminCancelNoteRequired,
  isAdminCancelReasonCode,
} from "@tarodan/types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Platform (admin) takas iptali — katalog kodu zorunlu; iç not opsiyonel ama
 * "Diğer"de zorunlu (kural `@tarodan/types`'ta, API aynı kuralla reddeder).
 * Kod formda metin olarak tutulur; `AdminCancelReasonCode`'a mutationFn'de
 * çevrilir (seçilmemiş hâli boş metindir).
 */
export const adminCancelTradeSchema = (t: T) =>
  z
    .object({
      reasonCode: z.string().refine((value) => isAdminCancelReasonCode(value), {
        message: t("admin.operations.trades.adminCancel.reasonRequired"),
      }),
      note: z.string().trim().max(ADMIN_CANCEL_NOTE_MAX),
    })
    .superRefine((values, ctx) => {
      if (
        isAdminCancelReasonCode(values.reasonCode) &&
        isAdminCancelNoteRequired(values.reasonCode) &&
        !values.note
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["note"],
          message: t("admin.operations.trades.adminCancel.noteRequired"),
        });
      }
    });
export type AdminCancelTradeValues = z.infer<
  ReturnType<typeof adminCancelTradeSchema>
>;

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
