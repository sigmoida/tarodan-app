import type { Prisma } from "@prisma/client";
import {
  REFUND_CANCELLATION_POLICY_SUFFIX,
  type RefundRequestKind,
} from "@tarodan/types";

/**
 * İade talebinin türü → Prisma koşulu. Tür politikadan okunur (tek kaynak:
 * `refundRequestKindOf`): kargo öncesi iptalin iadesi `*_cancellation`
 * politikasını taşır, kalan her talep ürün iadesidir.
 */
export function refundRequestKindWhere(
  kind: RefundRequestKind,
): Prisma.RefundRequestWhereInput {
  const cancellation: Prisma.RefundRequestWhereInput = {
    policyCode: { endsWith: REFUND_CANCELLATION_POLICY_SUFFIX },
  };
  return kind === "cancellation" ? cancellation : { NOT: cancellation };
}
