import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  ADMIN_CANCEL_NOTE_MAX,
  ADMIN_CANCEL_REASON_CODES,
  isAdminCancelNoteRequired,
  type AdminCancelReasonCode,
} from "@tarodan/types";

type T = ReturnType<typeof useTranslations<never>>;

/** Formda "henüz neden seçilmedi" hâli — select'in boş değeri. */
export const NO_ADMIN_CANCEL_REASON = "" as const;

/**
 * Platform (admin) takas iptali — katalog kodu zorunlu; iç not opsiyonel ama
 * "Diğer"de zorunlu (kural `@tarodan/types`'ta, API aynı kuralla reddeder).
 *
 * Girdi tipi "seçilmedi" hâlini (`""`) açıkça taşır; çıktı tipi yalnız katalog
 * kodudur — doğrulama "seçilmedi"yi reddettiği için neden seçilmeden gönderim
 * mümkün değildir (`AdminCancelTradeSubmit`).
 */
export const adminCancelTradeSchema = (t: T) =>
  z
    .object({
      reasonCode: z
        .union([
          z.literal(NO_ADMIN_CANCEL_REASON),
          z.enum(ADMIN_CANCEL_REASON_CODES),
        ])
        .refine(
          (value): value is AdminCancelReasonCode =>
            value !== NO_ADMIN_CANCEL_REASON,
          { message: t("admin.operations.trades.adminCancel.reasonRequired") },
        ),
      note: z.string().trim().max(ADMIN_CANCEL_NOTE_MAX),
    })
    .superRefine((values, ctx) => {
      if (isAdminCancelNoteRequired(values.reasonCode) && !values.note) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["note"],
          message: t("admin.operations.trades.adminCancel.noteRequired"),
        });
      }
    });
/** Form değerleri (girdi): neden seçilmemiş olabilir. */
export type AdminCancelTradeValues = z.input<
  ReturnType<typeof adminCancelTradeSchema>
>;
/** Doğrulanmış gönderim (çıktı): neden her zaman bir katalog kodudur. */
export type AdminCancelTradeSubmit = z.output<
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
