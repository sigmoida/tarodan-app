import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";
import { formatTL } from "@tarodan/shared";
import { parseTlAmount } from "@/lib/tlAmount";

/**
 * Make-offer form. `amount` stays the raw text of a `type="text"` field, read
 * by the shared TL amount parser (grouping such as "1.000" is refused, never
 * read as 1 TL), and is validated against the listing's price bounds: at least
 * 50% of the current price and strictly below it. Bounds are runtime values,
 * so this is a factory (like the auth / track-order schemas).
 */
export const offerSchema = (
  min: number,
  max: number,
  locale: string,
  /** Platform floor (admin setting); null = no rule. */
  floor: number | null = null,
) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return z.object({
    amount: z
      .string()
      .trim()
      .min(1, t("validation.enterAmount"))
      .superRefine((v, ctx) => {
        // One issue, in rule order: the field shows the first failing rule.
        const fail = (message: string) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        const parsed = parseTlAmount(v);
        if (parsed.status === "refused") {
          return fail(t("trade.cashFormatRefused"));
        }
        if (parsed.status === "empty") {
          return fail(t("validation.enterValidAmount"));
        }
        const amount = parsed.amount;
        if (amount < min) {
          return fail(
            t("offer.minimumOfferFloorError", { amount: formatTL(min) }),
          );
        }
        if (floor != null && amount < floor) {
          return fail(
            t("offer.minimumOfferFloorError", { amount: formatTL(floor) }),
          );
        }
        if (amount >= max) return fail(t("validation.offerBelowPrice"));
      }),
    message: z.string().trim().max(500, t("validation.max500Chars")).optional(),
  });
};

export type OfferValues = z.infer<ReturnType<typeof offerSchema>>;
