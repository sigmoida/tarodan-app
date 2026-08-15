/** @format */

import { z } from "zod";
import { isValidCardNumber, isExpiryValid, CVV_REGEX } from "@tarodan/ui";
import type { Translate } from "@/types/i18n";

/**
 * New-card payment form schema. Values are the normalized raw strings produced by
 * the masked payment inputs (number = digits, expiry = MMYY, cvc = digits).
 *
 * A `t`-taking factory rather than a module constant: the messages come from the
 * shared catalog, and a constant would have to call the hook at module level.
 */
export const newCardSchema = (t: Translate) =>
  z.object({
    holder: z.string().trim().min(2, t("validation.cardHolderRequired")),
    number: z
      .string()
      .refine(isValidCardNumber, t("validation.cardNumberInvalid")),
    expiry: z.string().refine(isExpiryValid, t("validation.cardExpiryInvalid")),
    cvc: z.string().regex(CVV_REGEX, t("validation.cvvInvalid")),
  });

export type NewCardValues = z.infer<ReturnType<typeof newCardSchema>>;

export const emptyNewCard: NewCardValues = {
  holder: "",
  number: "",
  expiry: "",
  cvc: "",
};
