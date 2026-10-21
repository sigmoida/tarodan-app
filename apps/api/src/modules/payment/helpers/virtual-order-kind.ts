import { VIRTUAL_ORDER_KINDS, type VirtualOrderKind } from "@tarodan/types";

/** The id prefix of each kind's virtual product. */
export const VIRTUAL_PRODUCT_ID_PREFIX = {
  membership: "membership-",
  boost: "boost-",
} as const satisfies Record<VirtualOrderKind, string>;

/** The virtual product of a boost purchase: `boost-<boostId>`. */
export function boostVirtualProductId(boostId: string): string {
  return `${VIRTUAL_PRODUCT_ID_PREFIX.boost}${boostId}`;
}

/**
 * Which platform service an order sells, read from its virtual product id
 * (`membership-<tierId>`, `boost-<boostId>`); null for a listing order. The
 * one place that knows the prefixes: payment status, return URLs and the
 * PayTR merchant choice call it (the remaining prefix checks in fulfilment,
 * refunds and invoicing are a backlog item).
 */
export function virtualOrderKind(
  order: { productId?: string | null } | null | undefined,
): VirtualOrderKind | null {
  const productId = order?.productId;
  if (!productId) return null;
  return (
    VIRTUAL_ORDER_KINDS.find((kind) =>
      productId.startsWith(VIRTUAL_PRODUCT_ID_PREFIX[kind]),
    ) ?? null
  );
}
