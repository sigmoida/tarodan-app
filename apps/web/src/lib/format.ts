/**
 * Format price as "12.30 TL" instead of "₺12.30" or "TRY 12.30"
 */
export function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined) {
    return '0,00 TL';
  }
  
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) {
    return '0,00 TL';
  }
  
  return `${numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

/**
 * Format price without TL suffix (for cases where TL is added separately)
 */
export function formatPriceNumber(price: number | string | null | undefined): string {
  if (price === null || price === undefined) {
    return '0,00';
  }
  
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) {
    return '0,00';
  }
  
  return numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
