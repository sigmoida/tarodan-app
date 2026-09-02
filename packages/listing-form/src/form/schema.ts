/** @format */

import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";
import { MAX_LISTING_COLORS } from "./constants";

/**
 * Shared building blocks for the new/edit listing form schemas. Numeric fields
 * (`price`, `quantity`, `year`, `bundleSize`) are bound to text/`<select>` inputs
 * as strings and coerced to numbers at submit time.
 */

export const listingFieldMessages = (locale: string) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return {
    required: t("auth.fillRequiredFields"),
    validPrice: t("common.invalidPrice"),
    setSize: t("product.setMinPieces"),
    photo: t("product.addThreePhotos"),
    descriptionLength: t("product.descriptionLength"),
  };
};

export type ListingFieldMessages = ReturnType<typeof listingFieldMessages>;

/** One uploaded image = its card + detail storage keys. */
export const listingImageSchema = z.object({
  cardKey: z.string(),
  detailKey: z.string(),
});

/** Fields common to both forms. Spread into each form's `z.object({...})`. */
export function baseListingFields(msg: ListingFieldMessages) {
  return {
    title: z.string().trim().min(1, msg.required).max(200),
    description: z
      .string()
      .trim()
      .min(30, msg.descriptionLength)
      .max(330, msg.descriptionLength),
    categoryId: z.string().min(1, msg.required),
    condition: z.string().min(1, msg.required),
    brandId: z.string().min(1, msg.required),
    carModelId: z.string(),
    modelCode: z.string().trim().max(100),
    /**
     * Renk artık katalogdan seçilir (global "color" attribute grubu).
     * `color` yalnız katalog boşken devreye giren serbest metin yedeğidir;
     * zorunluluk `colorsRefine` ile ikisinden birine bakılarak uygulanır.
     */
    colors: z.array(z.string()).max(MAX_LISTING_COLORS),
    color: z.string().trim().max(80),
    scale: z.string().min(1, msg.required),
    material: z.string().min(1, msg.required),
    manufacturerId: z.string().min(1, msg.required),
    isBoxed: z.enum(["boxed", "unboxed"], {
      required_error: msg.required,
      invalid_type_error: msg.required,
    }),
    year: z.string(),
    isTradeEnabled: z.boolean(),
    isSet: z.boolean(),
    bundleSize: z.string(),
    quantity: z.string(),
    // Kargo girdisi paket boyutu; desi arayüzde yok (sunucu kademeden türetir).
    shippingPackageTier: z.enum(["small", "medium", "large"], {
      required_error: msg.required,
      invalid_type_error: msg.required,
    }),
    price: z
      .string()
      .min(1, msg.required)
      .refine((v) => !isNaN(Number(v)) && Number(v) >= 1, msg.validPrice),
  };
}

/**
 * superRefine: renk zorunludur — katalogdan en az bir seçim ya da (katalog boşsa)
 * serbest metin. Hata her iki alanda da gösterilir; alan hangisiyse orası kızarır.
 */
export function colorsRefine(requiredMsg: string) {
  return (val: { colors: string[]; color: string }, ctx: z.RefinementCtx) => {
    if (val.colors.length > 0 || val.color.trim()) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["colors"],
      message: requiredMsg,
    });
  };
}

/**
 * Özel grup seçimleri: `{ grupSlug: [nitelikSlug] }`. Genel özel gruplar tek
 * değer taşır, üreticiye bağlı gruplar birden çok; ikisi de aynı haritada.
 * Değer asla `undefined` olmaz — temizlemede `[]` yazılır.
 */
export const customAttributesField = z.record(z.string(), z.array(z.string()));

/**
 * Zorunlu genel özel grupların slug'larını DOĞRULAMA ANINDA veren kaynak.
 *
 * Şema, gruplar sunucudan gelmeden kurulur (hook sırası: form önce, sorgu
 * sonra). react-hook-form çözümleyiciyi her render'da yeniden okuduğu için
 * bir getter, gönderim anında güncel listeyi görür; şemayı yeniden kurmak
 * ve formu remount etmek gerekmez.
 */
export type RequiredGroupSlugsSource = () => readonly string[];

/**
 * superRefine: zorunlu genel özel gruplardan her biri için en az bir seçim.
 * Hata ilgili grubun alanına (`customAttributes.<slug>`) bağlanır.
 */
export function requiredAttributeGroupsRefine(
  getRequired: RequiredGroupSlugsSource,
  requiredMsg: string,
) {
  return (
    val: { customAttributes: Record<string, string[]> },
    ctx: z.RefinementCtx,
  ) => {
    for (const slug of getRequired()) {
      if ((val.customAttributes[slug] ?? []).length > 0) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customAttributes", slug],
        message: requiredMsg,
      });
    }
  };
}

/** superRefine: when it's a set, require bundleSize >= 2. */
export function bundleSizeRefine(setSizeMsg: string) {
  return (
    val: { isSet: boolean; bundleSize: string },
    ctx: z.RefinementCtx,
  ) => {
    if (val.isSet) {
      const n = Number(val.bundleSize);
      if (!val.bundleSize || Number.isNaN(n) || n < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bundleSize"],
          message: setSizeMsg,
        });
      }
    }
  };
}

/** Default values for the shared base fields (each form adds its own extras). */
export const emptyBaseListingValues = {
  title: "",
  description: "",
  categoryId: "",
  condition: "",
  brandId: "",
  carModelId: "",
  modelCode: "",
  colors: [] as string[],
  color: "",
  scale: "",
  material: "",
  manufacturerId: "",
  // Runtime starts empty so the seller must make an explicit boxed/unboxed choice.
  isBoxed: "" as "boxed",
  year: "",
  isTradeEnabled: false,
  isSet: false,
  bundleSize: "",
  quantity: "",
  // En küçük boyut varsayılan: satıcı çoğunlukla küçük paket gönderir ve seçim
  // radyo kartlarında zaten görünür durumda olur.
  shippingPackageTier: "small" as const,
  price: "",
};
