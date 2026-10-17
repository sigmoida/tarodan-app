import type { Prisma } from "@prisma/client";

/** A persisted `RefundFinancialComponent` row as the settlement reads it. */
export interface StoredRefundComponent {
  componentCode: string;
  treatment: string;
  netAmount: Prisma.Decimal | number;
  grossAmount: Prisma.Decimal | number;
}

/**
 * The stored v2 components of a refund request row, when the row was read
 * with them (`include: { financialComponents: true }`); `null` otherwise,
 * for example a v1 request created without the include.
 */
export function storedComponentsOf(
  row: object,
): StoredRefundComponent[] | null {
  const value = (row as { financialComponents?: unknown }).financialComponents;
  return Array.isArray(value) ? (value as StoredRefundComponent[]) : null;
}
