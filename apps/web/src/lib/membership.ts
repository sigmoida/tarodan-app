/** @format */

import type { BadgeVariant } from "@tarodan/ui";
import type { Translate } from "@/types/i18n";

/**
 * Üyelik kademesinin arayüzdeki TEK karşılığı — ad, renk ve menü etiketi.
 *
 * Daha önce her yüzey kendi gösterimini kuruyordu: profil kartı API'den gelen
 * adı turuncu rozette ("Premium Üyelik"), hesap menüsü ise ham kademe kodunu
 * büyük harfli sarı bir etikette ("PREMIUM") basıyordu. Aynı bilgi iki farklı
 * ad ve iki farklı renkle görünüyordu.
 */

/**
 * Kademe kodundan görünen ad. API üyelik kaydını döndürdüğünde onun `tier.name`
 * alanı tercih edilir; bu harita yalnız ad elde olmadığında (ör. yalnız oturum
 * bilgisinden okuyan hesap menüsü) devreye girer, o yüzden değerleri admin'deki
 * `membership_tiers.name` ile birebir aynı tutulmalıdır.
 */
export const MEMBERSHIP_TIER_LABEL = (
  t: Translate,
): Record<string, string> => ({
  free: t("page.lib.membership.ucretsizUyelik"),
  basic: t("page.lib.membership.temelUyelik"),
  premium: t("page.lib.membership.premiumUyelik"),
  business: t("page.lib.membership.isUyeligi"),
});

export const MEMBERSHIP_TIER_VARIANT: Record<string, BadgeVariant> = {
  business: "warning",
  premium: "primary",
  basic: "secondary",
  free: "secondary",
};

/** Ücretli bir üyelik var mı? `free` ve boş değer üyeliksiz sayılır. */
export function hasPaidMembership(tier?: string | null): boolean {
  return !!tier && tier !== "free";
}

/**
 * Gezinme menülerindeki üyelik satırının etiketi. Üyeliği olmayan kullanıcıya
 * "Üyeliğim" demek yanıltıcı: yönetecek bir üyeliği yok, satın alacak var.
 */
export function membershipNavLabel(t: Translate, tier?: string | null): string {
  return hasPaidMembership(tier)
    ? t("page.lib.membership.uyeligim")
    : t("page.lib.membership.uyeOl");
}
