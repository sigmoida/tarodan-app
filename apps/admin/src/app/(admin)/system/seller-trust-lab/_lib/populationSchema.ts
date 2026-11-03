import { z } from "zod";
import { SELLER_TRUST_LEVELS, type SellerTrustLevel } from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";

/** The population card's filters: a tick per level and a minimum count. */
export const populationSchema = (t: Translate) =>
  z.object({
    levels: z.object({
      excellent: z.boolean(),
      trusted: z.boolean(),
      fair: z.boolean(),
      developing: z.boolean(),
      new: z.boolean(),
    }),
    minTransactions: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d+$/.test(v), {
        message: t("admin.system.sellerTrustLab.params.errors.integer", {
          field: t(
            "admin.system.sellerTrustLab.population.filterMinTransactions",
          ),
        }),
      }),
  });

export interface PopulationFormValues {
  levels: Record<SellerTrustLevel, boolean>;
  minTransactions: string;
}

export const POPULATION_FORM_DEFAULTS: PopulationFormValues = {
  levels: Object.fromEntries(
    SELLER_TRUST_LEVELS.map((level) => [level, false]),
  ) as Record<SellerTrustLevel, boolean>,
  minTransactions: "",
};
