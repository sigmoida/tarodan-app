import {
  fmtTry as formatTry,
  fmtDateTime as formatDateTime,
} from "@/lib/format";

export function fmtTry(n: number | string): string {
  return formatTry(n) ?? "—";
}

/** Named `fmtDate` locally but actually date+time — kept for call-site compat. */
export function fmtDate(d?: string | null): string {
  return d ? (formatDateTime(d) ?? "—") : "—";
}
