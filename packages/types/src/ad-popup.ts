/**
 * Popup reklamın gösterim sıklığı (Prisma `AdPopupFrequency`) — TEK kaynak.
 *
 * - `until_dismissed`: ziyaretçi kapatana kadar ana sayfaya her girişte açılır;
 *   kapatınca o reklamın o sürümü (`popupVersion`) bir daha açılmaz.
 * - `every_visit`: ana sayfaya her girişte açılır; kapatmak bir şey saklamaz.
 *
 * Admin reklamı her güncellediğinde API `popupVersion`'ı artırır: kapatılmış
 * popup yeni sürümde yeniden açılır.
 */
export const AD_POPUP_FREQUENCIES = ["until_dismissed", "every_visit"] as const;
export type AdPopupFrequency = (typeof AD_POPUP_FREQUENCIES)[number];

/** Şema varsayılanıyla aynı. */
export const AD_POPUP_FREQUENCY_DEFAULT: AdPopupFrequency = "until_dismissed";
