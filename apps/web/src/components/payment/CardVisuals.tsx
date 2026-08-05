/** @format */

import { BRAND_LABEL, type CardBrand } from "./card";

/** Card brand pill (pure CSS, no external logo deps). */
export function BrandBadge({
  brand,
  className = "",
}: {
  brand: CardBrand;
  className?: string;
}) {
  if (brand === "unknown") return null;
  const styles: Record<Exclude<CardBrand, "unknown">, string> = {
    visa: "bg-white text-[#1a1f71]",
    mastercard: "bg-white text-[#eb001b]",
    amex: "bg-white text-[#2e77bc]",
    troy: "bg-white text-[#00a0d2]",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-bold tracking-wide shadow-sm ${styles[brand]} ${className}`}
    >
      {BRAND_LABEL[brand]}
    </span>
  );
}

/** Mastercard interlocking rings. */
export function MastercardMark() {
  return (
    <span className="relative inline-flex h-6 w-10 items-center">
      <span className="absolute left-0 h-6 w-6 rounded-full bg-[#eb001b]" />
      <span className="absolute left-4 h-6 w-6 rounded-full bg-[#f79e1b] mix-blend-screen" />
    </span>
  );
}

/** Brand emblem used inline (mastercard rings vs a pill). */
export function BrandEmblem({ brand }: { brand: CardBrand }) {
  return brand === "mastercard" ? (
    <MastercardMark />
  ) : (
    <BrandBadge brand={brand} />
  );
}
