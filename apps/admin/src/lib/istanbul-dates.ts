import { ADMIN_TIME_ZONE } from "./format";

/**
 * Admin dates are Istanbul wall-clock times. A form holds `YYYY-MM-DD` (a
 * day) or `YYYY-MM-DDTHH:mm` (a date-time picker value); the API gets a full
 * ISO time with the Istanbul offset (Turkey is fixed at +03:00, no daylight
 * saving). A stored UTC instant going back into a form is never cut with
 * `.slice(...)`: instants from 21:00Z on are already the next Istanbul day.
 */
const ISTANBUL_OFFSET = "+03:00";

const dateTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function istanbulPartsOf(iso?: string | null): Record<string, string> | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Object.fromEntries(
    dateTimeParts.formatToParts(d).map((x) => [x.type, x.value]),
  );
}

/** The Istanbul calendar day of a stored instant (`YYYY-MM-DD`); `""` when empty or invalid. */
export function istanbulDateOf(iso?: string | null): string {
  const p = istanbulPartsOf(iso);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

/**
 * The Istanbul wall-clock minute of a stored instant as a date-time picker
 * value (`YYYY-MM-DDTHH:mm`); `""` when empty or invalid. Seconds are dropped.
 */
export function istanbulDateTimeOf(iso?: string | null): string {
  const p = istanbulPartsOf(iso);
  return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : "";
}

/** A start day -> 00:00 of that day in Istanbul. */
export const startOfIstanbulDayIso = (date: string): string =>
  `${date}T00:00:00.000${ISTANBUL_OFFSET}`;

/** An end day -> 23:59:59.999 of that day in Istanbul (the day included). */
export const endOfIstanbulDayIso = (date: string): string =>
  `${date}T23:59:59.999${ISTANBUL_OFFSET}`;

/**
 * A date-time picker value (`YYYY-MM-DDTHH:mm`, Istanbul wall clock) -> an
 * ISO time with the Istanbul offset; `""` when the value is not that shape.
 */
export function istanbulDateTimeIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00.000${ISTANBUL_OFFSET}`
    : "";
}
