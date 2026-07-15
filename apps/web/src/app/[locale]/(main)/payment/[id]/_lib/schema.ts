/** @format */

import { z } from "zod";
import { isValidCardNumber, isExpiryValid, CVV_REGEX } from "@tarodan/ui";

/**
 * New-card payment form schema. Values are the normalized raw strings produced by
 * the masked payment inputs (number = digits, expiry = MMYY, cvc = digits).
 */
export const newCardSchema = z.object({
  holder: z.string().trim().min(2, "Kart üzerindeki ismi girin"),
  number: z
    .string()
    .refine(isValidCardNumber, "Geçerli bir kart numarası girin"),
  expiry: z.string().refine(isExpiryValid, "Son kullanma tarihi geçersiz"),
  cvc: z.string().regex(CVV_REGEX, "CVV geçersiz"),
});

export type NewCardValues = z.infer<typeof newCardSchema>;

export const emptyNewCard: NewCardValues = {
  holder: "",
  number: "",
  expiry: "",
  cvc: "",
};
