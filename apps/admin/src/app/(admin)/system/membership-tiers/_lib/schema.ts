import { z } from "zod";

/** Yearly discount % — kept as a string (native number input); shaped in the mutationFn. */
export const yearlyDiscountSchema = z.object({
  discount: z
    .string()
    .trim()
    .min(1, "Zorunlu")
    .refine((v) => {
      const n = Number(v);
      return !Number.isNaN(n) && n >= 0 && n <= 100;
    }, "0 ile 100 arasında bir değer girin"),
});

export type YearlyDiscountValues = z.infer<typeof yearlyDiscountSchema>;
