/**
 * The platform's own warehouse address — the destination of every inbound
 * parcel we ask a user to send us.
 *
 * Two flows need it: a trade's inbound leg (both parcels come to us before
 * either goes out) and a refund's return leg. Each had its own copy of the five
 * env reads and their defaults, kept in step by hand — the refund copy's
 * comment even said it must match the trade one. Two definitions of one
 * address is a mismatch waiting for the first time only one of them is updated,
 * and the failure mode is a parcel shipped to the wrong place.
 *
 * Defaults are deliberately non-null: an unset env must not block a return or a
 * trade, so the address falls back to head office rather than failing.
 */

export interface WarehouseAddress {
  fullName: string;
  address: string;
  city: string;
  district: string;
  phone: string;
}

export function platformWarehouseAddress(): WarehouseAddress {
  return {
    fullName: process.env.TARODAN_WAREHOUSE_NAME?.trim() || "Tarodan Depo",
    address:
      process.env.TARODAN_WAREHOUSE_ADDRESS?.trim() ||
      "Tarodan Merkez Depo Adresi",
    city: process.env.TARODAN_WAREHOUSE_CITY?.trim() || "Istanbul",
    district: process.env.TARODAN_WAREHOUSE_DISTRICT?.trim() || "Maltepe",
    phone: process.env.TARODAN_WAREHOUSE_PHONE?.trim() || "05000000000",
  };
}
