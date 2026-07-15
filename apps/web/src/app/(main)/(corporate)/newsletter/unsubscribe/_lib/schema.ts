import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/** Newsletter unsubscribe by email — optional feedback, locale-aware messages. */
export const unsubscribeSchema = (locale: string) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, t("validation.emailRequired"))
      .email(t("validation.invalidEmail")),
    feedback: z.string().trim().optional(),
  });
};

export type UnsubscribeValues = z.infer<ReturnType<typeof unsubscribeSchema>>;
