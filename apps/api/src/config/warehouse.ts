/**
 * The platform warehouse address as literal text, for the carrier payloads that
 * need a recipient written out: a trade's inbound leg (both parcels come to us
 * before either goes out) and a refund's return leg. Each flow had its own copy
 * of these five env reads and their defaults, kept in step by hand — the refund
 * copy's comment even said it must match the trade one — so a parcel could be
 * addressed one way and the other flow's parcel another.
 *
 * ⚠ Do not call this directly — go through `WarehouseAddressService`.
 *
 * This used to be one of two independent warehouse addresses: inbound trade legs
 * and refund returns wrote out this env text, while outbound and return
 * shipments resolved an Address *row* from the `warehouse_address_id` platform
 * setting. Moving the warehouse in admin Settings left this copy stale with the
 * health check still green. Carrier payloads now carry the sender as well as the
 * recipient, so both copies would have gone on the wire — the same warehouse,
 * spelled two ways, on the two legs of one trade.
 *
 * `WarehouseAddressService` is now the single resolver and the setting row wins;
 * these values are its last-resort fallback, which is why the defaults below
 * stay non-null.
 *
 * Note also that `TARODAN_WAREHOUSE_*` is not declared in
 * `config/env.validation.ts`, and ConfigModule drops undeclared keys read from
 * an `.env` file — so these only take effect where they are injected as real
 * environment variables (see CLAUDE.md §15, "Known, undecided").
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
