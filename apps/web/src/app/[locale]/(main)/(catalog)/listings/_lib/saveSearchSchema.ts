import { z } from "zod";
import { SAVED_SEARCH_NAME_MAX } from "@tarodan/types";
import type { Translate } from "@/types/i18n";

/** The name field of the "Save this search" modal (optional; the API derives one when blank). */
export const saveSearchSchema = (t: Translate) =>
  z.object({
    name: z
      .string()
      .trim()
      .refine((v) => Array.from(v).length <= SAVED_SEARCH_NAME_MAX, {
        message: t("validation.maxLength", { max: SAVED_SEARCH_NAME_MAX }),
      }),
  });
export type SaveSearchValues = z.infer<ReturnType<typeof saveSearchSchema>>;
