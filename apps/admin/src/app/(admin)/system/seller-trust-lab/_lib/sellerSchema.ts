import { z } from "zod";
import { SELLER_TRUST_LAB_AS_OF } from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";

/** The seller card's form: a user id, the as-of switch, the candidate toggle. */
export const sellerSchema = (t: Translate) =>
  z.object({
    userId: z
      .string()
      .trim()
      .uuid(t("admin.system.sellerTrustLab.seller.userIdHint")),
    asOf: z.enum(SELLER_TRUST_LAB_AS_OF),
    useCandidate: z.boolean(),
  });

export type SellerFormValues = z.infer<ReturnType<typeof sellerSchema>>;

export const SELLER_FORM_DEFAULTS: SellerFormValues = {
  userId: "",
  asOf: "now",
  useCandidate: false,
};

/** Is this text a user id the lab can ask for (e.g. from `?userId=`)? */
export const isUserId = (value: string | null | undefined): value is string =>
  z.string().uuid().safeParse(value?.trim()).success;
