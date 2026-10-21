import { z } from "zod";
import type { useTranslations } from "next-intl";
import { ZERO_TL_AMOUNT, parseTlAmount } from "@tarodan/shared";
import { amountField } from "@/lib/schemas/amount";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Discount form — validation-only. Numeric fields are kept as strings; the
 * string→number/ISO conversion happens in the modal's mutationFn, so the
 * z.infer types stay honest. The value and the TL amounts are text fields read
 * by the shared TL amount parser (`@/lib/schemas/amount`): "1.000" is refused,
 * never 1 TL.
 */
export const discountSchema = (t: T) =>
  z
    .object({
      code: z.string(),
      name: z
        .string()
        .min(1, t("admin.marketing.discounts.validation.nameRequired")),
      description: z.string(),
      type: z.enum(["percentage", "fixed_amount", "bogo", "bulk_quantity"]),
      value: z.string(),
      scope: z.enum(["global", "category"]),
      categoryId: z.string(),
      // Cep kuralı: platform ürün fiyatına dokunamaz, bu yüzden bu listede
      // `product_price` YOKTUR (backend de reddeder).
      target: z.enum([
        "buyer_commission",
        "buyer_service_fee",
        "buyer_shipping",
        "seller_commission",
        "seller_platform_fee",
        "seller_shipping",
        // Takas hizmet bedeli (İ25): kodsuz-otomatik, kabulde iki tarafa uygulanır.
        "trade_service_fee",
      ]),
      audience: z.enum([
        "everyone",
        "membership_tiers",
        "specific_buyers",
        "specific_sellers",
        "all_buyers",
        "all_sellers",
      ]),
      // Chip'ler etiketleriyle taşınır (FormSearchableMultiSelect sözleşmesi).
      targetTierTypes: z.array(
        z.object({ value: z.string(), label: z.string() }),
      ),
      // Çipler etiketleriyle taşınır: seçilenler formda UUID değil kişi olarak
      // görünsün diye (FormSearchableMultiSelect sözleşmesi).
      targetUserIds: z.array(
        z.object({ value: z.string(), label: z.string() }),
      ),
      // Bedel indiriminin maliyeti platformundur: kullanım adedi maliyet kontrolü
      // değildir (sepet büyüdükçe tutar büyür), TL bütçe zorunludur.
      budgetLimit: amountField(t, {
        required: t("admin.marketing.discounts.validation.budgetRequired"),
        check: {
          test: (amount) => amount > 0,
          message: t("admin.marketing.discounts.validation.budgetRequired"),
        },
      }),
      minCartValue: amountField(t),
      minQuantity: z.string(),
      buyQuantity: z.string(),
      getQuantity: z.string(),
      maxDiscountAmount: amountField(t),
      usageLimitTotal: z.string(),
      usageLimitPerUser: z.string(),
      isStackable: z.boolean(),
      isActive: z.boolean(),
      isFlashSale: z.boolean(),
      startDate: z
        .string()
        .min(1, t("admin.marketing.discounts.validation.startDateRequired")),
      endDate: z
        .string()
        .min(1, t("admin.marketing.discounts.validation.endDateRequired")),
    })
    .superRefine((d, ctx) => {
      // The value is TL only for a fixed amount; a percent (also the bogo and
      // bulk rates) keeps its 0..100 bound and gets the generic copy, since
      // the format copy speaks of kurus.
      const refuse = (message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message });
      const parsed = parseTlAmount(d.value, ZERO_TL_AMOUNT);
      const isPercent = d.type !== "fixed_amount";
      if (parsed.status === "refused") {
        refuse(
          isPercent
            ? t("validation.enterValidValue")
            : t("validation.amountFormatRefused"),
        );
      } else if (parsed.status === "empty") {
        refuse(t("admin.marketing.discounts.validation.valueRequired"));
      } else if (isPercent && parsed.amount > 100) {
        refuse(t("validation.maxValue", { max: 100 }));
      }
    })
    .refine((d) => d.scope !== "category" || d.categoryId.length > 0, {
      message: t("admin.marketing.discounts.selectCategory"),
      path: ["categoryId"],
    })
    .refine(
      (d) => d.audience !== "membership_tiers" || d.targetTierTypes.length > 0,
      {
        message: t("admin.marketing.discounts.validation.tiersRequired"),
        path: ["targetTierTypes"],
      },
    )
    .refine(
      (d) =>
        (d.audience !== "specific_buyers" &&
          d.audience !== "specific_sellers") ||
        d.targetUserIds.length > 0,
      {
        message: t("admin.marketing.discounts.validation.usersRequired"),
        path: ["targetUserIds"],
      },
    )
    // Kalem kimin cebine bakıyorsa kitle o tarafta olmalıdır; aksi halde kampanya
    // sessizce hiçbir şey indirmez.
    .refine(
      (d) =>
        !d.target.startsWith("seller_") ||
        (d.audience !== "all_buyers" && d.audience !== "specific_buyers"),
      {
        message: t(
          "admin.marketing.discounts.validation.sellerAudienceRequired",
        ),
        path: ["audience"],
      },
    )
    .refine(
      (d) =>
        !d.target.startsWith("buyer_") ||
        (d.audience !== "all_sellers" && d.audience !== "specific_sellers"),
      {
        message: t(
          "admin.marketing.discounts.validation.buyerAudienceRequired",
        ),
        path: ["audience"],
      },
    );

export type DiscountFormValues = z.infer<ReturnType<typeof discountSchema>>;
