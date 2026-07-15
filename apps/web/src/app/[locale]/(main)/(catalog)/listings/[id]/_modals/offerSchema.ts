import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/**
 * Make-offer form. `amount` stays the raw input string (the `<input type=number>`
 * value) and is validated against the listing's price bounds: at least 50% of the
 * current price and strictly below it. Bounds are runtime values, so this is a
 * factory (like the auth / track-order schemas).
 */
export const offerSchema = (min: number, max: number, locale: string) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return z.object({
    amount: z
      .string()
      .trim()
      .min(1, t("validation.enterAmount"))
      .refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        t("validation.enterValidAmount"),
      )
      .refine((v) => parseFloat(v) >= min, `Min: ${min.toFixed(2)} TL (50%)`)
      .refine((v) => parseFloat(v) < max, t("validation.offerBelowPrice")),
    message: z.string().trim().max(500, t("validation.max500Chars")).optional(),
  });
};

export type OfferValues = z.infer<ReturnType<typeof offerSchema>>;
