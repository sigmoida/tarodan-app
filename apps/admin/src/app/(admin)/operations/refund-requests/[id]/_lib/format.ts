import { fmtTry as formatTry } from "@/lib/format";

export function fmtTry(n: number | string): string {
  return formatTry(n) ?? "—";
}

export function fmtDate(d?: string | null): string {
  return d ? new Date(d).toLocaleString("tr-TR") : "—";
}
