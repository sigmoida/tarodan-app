import { z } from "zod";
import type { Translate } from "@/types/i18n";

/** Create-ticket form. Messages come from the catalog, so this is a factory. */
export const ticketSchema = (t: Translate) =>
  z.object({
    category: z.string().min(1, t("validation.selectCategory")),
    subject: z
      .string()
      .trim()
      .min(5, t("validation.subjectMin5"))
      .max(200, t("validation.maxLength", { max: 200 })),
    message: z
      .string()
      .trim()
      .min(10, t("validation.messageMin10"))
      .max(2000, t("validation.maxLength", { max: 2000 })),
  });
export type TicketValues = z.infer<ReturnType<typeof ticketSchema>>;

/** Ticket reply form. */
export const replySchema = z.object({
  reply: z.string().trim().min(1).max(2000),
});
export type ReplyValues = z.infer<typeof replySchema>;
