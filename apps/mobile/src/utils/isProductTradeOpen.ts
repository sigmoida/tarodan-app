/**
 * Tek kaynak: API / arama / eski mobil store farklı alan adlarıyla
 * "takas açık" bilgisini döndürebilir.
 */
const truthy = (v: unknown): boolean => {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    return (
      s === 'true' ||
      s === '1' ||
      s === 'yes' ||
      s === 'open' ||
      s === 'available' ||
      s === 'enabled'
    );
  }
  return false;
};

export function isProductTradeOpen(
  item: Record<string, unknown> | null | undefined
): boolean {
  if (!item || typeof item !== 'object') return false;

  if (truthy(item.isTradeEnabled)) return true;
  if (truthy(item.tradeAvailable)) return true;
  if (truthy(item.trade_available)) return true;
  if (truthy(item.trade_enabled)) return true;

  const trade = item.trade as Record<string, unknown> | undefined;
  if (trade && typeof trade === 'object') {
    if (truthy(trade.available)) return true;
    if (truthy(trade.isEnabled)) return true;
    if (truthy(trade.enabled)) return true;
  }

  const status = item.tradeStatus;
  if (typeof status === 'string') {
    const s = status.toLowerCase();
    if (s === 'open' || s === 'available' || s === 'enabled') return true;
  }

  return false;
}
