import { z } from "zod";

/** A VAT rate 0..100, kept as a string (native number input); shaped in the mutationFn. */
const rateField = z
  .string()
  .trim()
  .min(1, "Zorunlu")
  .refine((v) => {
    const n = Number(v);
    return !Number.isNaN(n) && n >= 0 && n <= 100;
  }, "Oran 0 ile 100 arasında olmalı");

/** Default VAT rate form. */
export const vatDefaultSchema = z.object({ rate: rateField });
export type VatDefaultValues = z.infer<typeof vatDefaultSchema>;

/** Per-category VAT override form. */
export const vatOverrideSchema = z.object({
  categoryId: z.string().min(1, "Kategori seçin"),
  rate: rateField,
});
export type VatOverrideValues = z.infer<typeof vatOverrideSchema>;
