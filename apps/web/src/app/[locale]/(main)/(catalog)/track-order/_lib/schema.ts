import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/** Guest order-tracking lookup form — locale-aware messages (like the auth schemas). */
export const trackOrderSchema = (locale: string) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return z.object({
    orderNumber: z.string().trim().min(1, t("validation.enterOrderNumber")),
    email: z
      .string()
      .trim()
      .min(1, t("validation.invalidEmail"))
      .email(t("validation.invalidEmail")),
  });
};

export type TrackOrderValues = z.infer<ReturnType<typeof trackOrderSchema>>;
