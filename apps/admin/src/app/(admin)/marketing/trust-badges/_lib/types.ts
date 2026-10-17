import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  TRUST_BADGE_ICONS,
  TRUST_BADGE_LIMITS,
  type AdminTrustBadgeDto,
} from "@tarodan/types";
import {
  addLocalizedIssues,
  localizedFromForm,
  localizedShape,
  localizedToForm,
} from "@/lib/localized-form";

type T = ReturnType<typeof useTranslations<never>>;

/** Yalnız istemci ipucu: yayında bu kadar rozetten fazlası sığmaz (sunucu zorlamaz). */
export const TRUST_BADGE_MAX_ACTIVE = 8;

/**
 * API satırı (`GET /admin/trust-badges`) — sözleşme `@tarodan/types`ta. İkon
 * burada geniş `string`: liste daralırsa eski satır yine listelenir ve
 * düzeltilebilir (API admin şeklinde doğrulamaz).
 */
export type TrustBadge = Omit<AdminTrustBadgeDto, "icon"> & { icon: string };

export const TRUST_BADGE_LOCALIZED_FIELDS = ["title", "description"] as const;

const maxMessage = (t: T, max: number) =>
  t("admin.marketing.trustBadges.validation.maxLength", { max });

export const trustBadgeSchema = (t: T) =>
  z
    .object({
      icon: z
        .string()
        .refine((v) => (TRUST_BADGE_ICONS as readonly string[]).includes(v), {
          message: t("admin.marketing.trustBadges.validation.iconRequired"),
        }),
      ...localizedShape(
        "title",
        TRUST_BADGE_LIMITS.title,
        maxMessage(t, TRUST_BADGE_LIMITS.title),
      ),
      ...localizedShape(
        "description",
        TRUST_BADGE_LIMITS.description,
        maxMessage(t, TRUST_BADGE_LIMITS.description),
      ),
      isActive: z.boolean().default(true),
      // Mobil uygulamada (iOS ve Android) gizle; web yok sayar.
      hideOnIos: z.boolean().default(false),
    })
    .superRefine((v, ctx) => {
      const messages = {
        required: t("admin.marketing.trustBadges.validation.trRequired"),
        trRequiredForEn: t(
          "admin.marketing.trustBadges.validation.trRequiredForEn",
        ),
      };
      addLocalizedIssues(ctx, v, "title", true, messages);
      addLocalizedIssues(ctx, v, "description", false, messages);
    });

export type TrustBadgeFormValues = z.infer<ReturnType<typeof trustBadgeSchema>>;

export const emptyTrustBadgeForm: TrustBadgeFormValues = {
  icon: TRUST_BADGE_ICONS[0],
  ...localizedToForm("title"),
  ...localizedToForm("description"),
  isActive: true,
  hideOnIos: false,
};

export const trustBadgeToForm = (b: TrustBadge): TrustBadgeFormValues => ({
  icon: b.icon,
  ...localizedToForm("title", b.title),
  ...localizedToForm("description", b.description),
  isActive: b.isActive,
  hideOnIos: b.hideOnIos,
});

/** create: boş açıklama atlanır; update: boşaltılan açıklama `null` ile temizlenir. */
export function trustBadgeFormToPayload(
  v: TrustBadgeFormValues,
  mode: "create" | "update",
) {
  return {
    icon: v.icon,
    title: localizedFromForm(v, "title", mode),
    description: localizedFromForm(v, "description", mode),
    isActive: v.isActive,
    hideOnIos: v.hideOnIos,
  };
}

export const iconOptions = () =>
  TRUST_BADGE_ICONS.map((value) => ({ value, label: value }));
