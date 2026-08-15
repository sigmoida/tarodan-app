/** @format */
import type { Translate } from "@/types/i18n";

/**
 * Hakkımızda metni — kurumsal anlatının tek kaynağı.
 *
 * Sayfa eskiden CMS'ten (`/api/pages/about`) besleniyordu; metin kurumsal
 * olarak sabitlendiği için artık burada duruyor.
 */

/** Açılış cümlesi — sayfanın üstünde büyük punto ile gösterilir. */
export const aboutLead = (t: Translate) =>
  t("information.about.herKoleksiyonunBirHikayesiVardirTarodanin");

export const aboutStory = (t: Translate): string[] => [
  t("information.about.cocuklugumuzdaBaslayanArabaSevgisiZamanlaGercek"),
  t("information.about.yillarBoyuncaBinlerceKoleksiyonerleAyniHeyecani"),
  t("information.about.alimSatimlarSosyalMedyaGruplarindaYapiliyor"),
  t("information.about.bizDeKendiKendimizeSuSoruyu"),
];

/** Sayfanın ortasındaki alıntı. */
export const aboutQuestion = (t: Translate) =>
  t("information.about.nedenSadeceDiecastKoleksiyonerlerininKendiniEvinde");

export const aboutAnswer = (t: Translate): string[] => [
  t("information.about.isteTarodanTamDaBuSorunun"),
  t("information.about.buradaAmacSadeceModelArabaAlip"),
  t("information.about.tarodaniGelistirirkenHerDetayiKoleksiyonerGozuyle"),
];

/** Kapanış — vurgulu gösterilir. */
export const aboutClosing = (t: Translate) => ({
  kicker: t("information.about.buYuzdenTarodanSadeceBirPazar"),
  headline: t("information.about.diecastKoleksiyonerlerininDijitalGaraji"),
  outro: t(
    "information.about.tarodanKoleksiyonunuSadeceSakladiginDegilYasattigin",
  ),
});
