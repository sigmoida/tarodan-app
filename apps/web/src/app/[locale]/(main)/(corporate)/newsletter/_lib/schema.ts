import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/** Newsletter signup — email + preference toggles, locale-aware messages. */
export const newsletterSchema = (locale: string) => {
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
    newsletter: z.boolean(),
    promotions: z.boolean(),
  });
};

export type NewsletterValues = z.infer<ReturnType<typeof newsletterSchema>>;
