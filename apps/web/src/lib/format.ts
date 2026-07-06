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

/** Alias of {@link formatPrice} — "12,30 TL". The single money formatter used
 * across profile surfaces (my-listings, orders, offers, trades, …). */
export const formatTL = formatPrice;

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

/**
 * Format product condition to Turkish
 * Converts: new, like_new, very_good, good, fair, poor
 */
export function formatCondition(condition: string | null | undefined, locale: string = 'tr'): string {
  if (!condition) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  // Filtre ve ürün kartında aynı etiketler kullanılsın (Yeni, Yeni Gibi, İyi, Orta)
  const conditionMap: Record<string, { tr: string; en: string }> = {
    'new': { tr: 'Yeni', en: 'New' },
    'like_new': { tr: 'Yeni Gibi', en: 'Like New' },
    'very_good': { tr: 'Çok İyi', en: 'Very Good' },
    'good': { tr: 'İyi', en: 'Good' },
    'fair': { tr: 'Orta', en: 'Fair' },
    'poor': { tr: 'Kötü', en: 'Poor' },
  };

  const normalized = condition.toLowerCase().trim();
  const mapped = conditionMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  // Fallback: capitalize and replace underscores
  return condition.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/**
 * Format order status to Turkish
 * Converts: pending_payment, paid, preparing, shipped, delivered, completed, cancelled, refund_requested, refunded
 */
export function formatOrderStatus(status: string | null | undefined, locale: string = 'tr'): string {
  if (!status) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  const statusMap: Record<string, { tr: string; en: string }> = {
    'pending_payment': { tr: 'Ödeme Bekleniyor', en: 'Pending Payment' },
    'paid': { tr: 'Ödeme Alındı', en: 'Paid' },
    'preparing': { tr: 'Hazırlanıyor', en: 'Preparing' },
    'shipped': { tr: 'Kargoya Verildi', en: 'Shipped' },
    'in_transit': { tr: 'Yolda', en: 'In Transit' },
    'out_for_delivery': { tr: 'Dağıtımda', en: 'Out for Delivery' },
    'delivered': { tr: 'Teslim Edildi', en: 'Delivered' },
    'completed': { tr: 'Tamamlandı', en: 'Completed' },
    'cancelled': { tr: 'İptal Edildi', en: 'Cancelled' },
    'refund_requested': { tr: 'İade Talep Edildi', en: 'Refund Requested' },
    'refunded': { tr: 'İade Edildi', en: 'Refunded' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/**
 * Format product status to Turkish
 * Converts: pending, active, reserved, sold, inactive, rejected
 */
export function formatProductStatus(status: string | null | undefined, locale: string = 'tr'): string {
  if (!status) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  const statusMap: Record<string, { tr: string; en: string }> = {
    'pending': { tr: 'Onay Bekliyor', en: 'Pending' },
    'active': { tr: 'Aktif', en: 'Active' },
    'reserved': { tr: 'Rezerve', en: 'Reserved' },
    'sold': { tr: 'Satıldı', en: 'Sold' },
    'inactive': { tr: 'Pasif', en: 'Inactive' },
    'rejected': { tr: 'Reddedildi', en: 'Rejected' },
    'deleted': { tr: 'Kaldırıldı', en: 'Removed' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/**
 * Format shipment status to Turkish
 * Converts: pending, label_created, picked_up, in_transit, out_for_delivery, delivered, returned, failed
 */
export function formatShipmentStatus(status: string | null | undefined, locale: string = 'tr'): string {
  if (!status) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  const statusMap: Record<string, { tr: string; en: string }> = {
    'pending': { tr: 'Beklemede', en: 'Pending' },
    'label_created': { tr: 'Etiket Oluşturuldu', en: 'Label Created' },
    'picked_up': { tr: 'Teslim Alındı', en: 'Picked Up' },
    'in_transit': { tr: 'Yolda', en: 'In Transit' },
    'out_for_delivery': { tr: 'Dağıtımda', en: 'Out for Delivery' },
    'delivered': { tr: 'Teslim Edildi', en: 'Delivered' },
    'returned': { tr: 'İade Edildi', en: 'Returned' },
    'failed': { tr: 'Başarısız', en: 'Failed' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/**
 * Format trade status to Turkish
 * Converts: pending, accepted, rejected, cancelled, completed
 */
export function formatTradeStatus(status: string | null | undefined, locale: string = 'tr'): string {
  if (!status) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  const statusMap: Record<string, { tr: string; en: string }> = {
    'pending': { tr: 'Beklemede', en: 'Pending' },
    'accepted': { tr: 'Kabul Edildi', en: 'Accepted' },
    'rejected': { tr: 'Reddedildi', en: 'Rejected' },
    'cancelled': { tr: 'İptal Edildi', en: 'Cancelled' },
    'completed': { tr: 'Tamamlandı', en: 'Completed' },
    'in_progress': { tr: 'Devam Ediyor', en: 'In Progress' },
    'shipping': { tr: 'Kargo Aşamasında', en: 'Shipping' },
    'awaiting_confirmation': { tr: 'Onay Bekleniyor', en: 'Awaiting Confirmation' },
    'initiator_shipped': { tr: 'Gönderen Kargoya Verdi', en: 'Initiator Shipped' },
    'receiver_shipped': { tr: 'Alıcı Kargoya Verdi', en: 'Receiver Shipped' },
    'both_shipped': { tr: 'Her İki Taraf Kargoda', en: 'Both Shipped' },
    'initiator_received': { tr: 'Gönderen Teslim Aldı', en: 'Initiator Received' },
    'receiver_received': { tr: 'Alıcı Teslim Aldı', en: 'Receiver Received' },
    // Escrow / güvenli takas statüleri
    'awaiting_payment': { tr: 'Ödeme Bekleniyor', en: 'Awaiting Payment' },
    'shipping_to_warehouse': { tr: 'Depoya Gönderiliyor', en: 'Shipping to Warehouse' },
    'at_warehouse': { tr: 'Depoda', en: 'At Warehouse' },
    'admin_reviewing': { tr: 'İnceleniyor', en: 'Under Review' },
    'shipping_to_recipients': { tr: 'Alıcılara Gönderiliyor', en: 'Shipping to Recipients' },
    'returning': { tr: 'İade Ediliyor', en: 'Returning' },
    'disputed': { tr: 'Anlaşmazlık', en: 'Disputed' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/**
 * Format offer status to Turkish
 * Converts: pending, accepted, rejected, expired, cancelled, counter_offered
 */
export function formatOfferStatus(status: string | null | undefined, locale: string = 'tr'): string {
  if (!status) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  const statusMap: Record<string, { tr: string; en: string }> = {
    'pending': { tr: 'Beklemede', en: 'Pending' },
    'accepted': { tr: 'Kabul Edildi', en: 'Accepted' },
    'rejected': { tr: 'Reddedildi', en: 'Rejected' },
    'expired': { tr: 'Süresi Doldu', en: 'Expired' },
    'cancelled': { tr: 'İptal Edildi', en: 'Cancelled' },
    'counter_offered': { tr: 'Karşı Teklif Yapıldı', en: 'Counter Offered' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

