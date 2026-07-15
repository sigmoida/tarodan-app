/** @format */

const DATE_LOCALES: Record<string, string> = { en: "en-US", tr: "tr-TR" };

/** Estimated delivery = 3 business days from the order date. */
export function getEstimatedDelivery(
  orderDate: string,
  locale: string,
): string {
  const date = new Date(orderDate);
  let businessDays = 0;
  while (businessDays < 3) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) businessDays++;
  }
  return date.toLocaleDateString(DATE_LOCALES[locale] ?? "tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
