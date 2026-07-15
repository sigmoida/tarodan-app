import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/** Guest contact form — locale-aware messages (like the auth / track-order schemas). */
export const contactSchema = (locale: string) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return z.object({
    name: z.string().trim().min(1, t("validation.nameRequired")),
    email: z
      .string()
      .trim()
      .min(1, t("validation.emailRequired"))
      .email(t("validation.invalidEmail")),
    subject: z.string().trim().min(1, t("validation.subjectRequired")),
    message: z.string().trim().min(10, t("validation.messageMin")),
  });
};

export type ContactValues = z.infer<ReturnType<typeof contactSchema>>;
