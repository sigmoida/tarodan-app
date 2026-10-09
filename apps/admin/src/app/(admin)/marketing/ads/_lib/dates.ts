import { ADMIN_TIME_ZONE } from "@/lib/format";

/**
 * Reklam tarihleri İstanbul takvim günüdür. Form `YYYY-MM-DD` tutar; API'ye
 * İstanbul ofsetli tam ISO gider (Türkiye kalıcı +03:00, yaz saati yok).
 * Kayıtlı UTC anı forma dönerken `.slice(0, 10)` KULLANILMAZ: 21:00Z sonrası
 * anlar İstanbul'da ertesi gündür.
 */
const ymdParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kayıtlı anın İstanbul takvim günü (`YYYY-MM-DD`); boş/geçersizde `""`. */
export function istanbulDateOf(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    ymdParts.formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** Başlangıç günü → o günün İstanbul 00:00'ı. */
export const startOfIstanbulDayIso = (date: string): string =>
  `${date}T00:00:00.000+03:00`;

/** Bitiş günü → o günün İstanbul 23:59:59.999'u (gün dahil). */
export const endOfIstanbulDayIso = (date: string): string =>
  `${date}T23:59:59.999+03:00`;
