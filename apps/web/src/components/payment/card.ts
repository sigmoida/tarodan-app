/** @format */

// Card brand detection + presentation helpers (no external logo deps).

/** Sentinel for the "pay with a new card" radio option. */
export const NEW_CARD = "__new__";

export type CardBrand = "visa" | "mastercard" | "amex" | "troy" | "unknown";

export function detectBrand(num: string): CardBrand {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|22[2-9]|2[3-6]|27[01]|2720)/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^9792/.test(n)) return "troy";
  return "unknown";
}

/** Map a saved card's textual brand label to a brand key. */
export function brandFromLabel(label?: string | null): CardBrand {
  const s = (label || "").toLowerCase();
  if (s.includes("visa")) return "visa";
  if (s.includes("master")) return "mastercard";
  if (s.includes("amex") || s.includes("express")) return "amex";
  if (s.includes("troy")) return "troy";
  return "unknown";
}

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "AMEX",
  troy: "TROY",
  unknown: "",
};
