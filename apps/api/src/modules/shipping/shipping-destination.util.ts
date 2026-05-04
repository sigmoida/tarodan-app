/**
 * Edge case 1.11: prefer saved Address row; if missing (e.g. deleted), use order.shippingAddress JSON snapshot.
 */
export function resolveShippingDestinationCity(
  shippingAddressRow: { city: string | null } | null | undefined,
  shippingJson: unknown,
  defaultCity = 'Istanbul',
): string {
  const fromRow = shippingAddressRow?.city?.trim();
  if (fromRow) return fromRow;
  if (shippingJson && typeof shippingJson === 'object' && shippingJson !== null) {
    const raw = (shippingJson as Record<string, unknown>).city;
    const c = raw != null ? String(raw).trim() : '';
    if (c) return c;
  }
  return defaultCity;
}
