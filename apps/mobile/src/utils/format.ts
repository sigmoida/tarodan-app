/**
 * Format helpers ported from apps/web/src/lib/format.ts.
 * Mobile uyumunu (parite) korumak için her fonksiyonun imzası ve davranışı web ile birebir aynıdır.
 */

/**
 * Backend'den brand/scale/category bazen string ("AutoArt"), bazen obje ({id,name,slug}) gelir.
 * <Text> içine doğrudan koyulamayacağı için her iki şekli de string'e indirger.
 */
export function asLabel(value: unknown, fallback: string = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const v = value as { name?: unknown; title?: unknown; slug?: unknown };
    if (typeof v.name === 'string') return v.name;
    if (typeof v.title === 'string') return v.title;
    if (typeof v.slug === 'string') return v.slug;
  }
  return fallback;
}

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

export function formatCondition(condition: string | null | undefined, locale: string = 'tr'): string {
  if (!condition) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

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

  return condition.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

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

  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

export function formatProductStatus(status: string | null | undefined, locale: string = 'tr'): string {
  if (!status) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  const statusMap: Record<string, { tr: string; en: string }> = {
    'pending': { tr: 'Onay Bekliyor', en: 'Pending' },
    'active': { tr: 'Aktif', en: 'Active' },
    'reserved': { tr: 'Rezerve', en: 'Reserved' },
    'sold': { tr: 'Satıldı', en: 'Sold' },
    'inactive': { tr: 'Pasif', en: 'Inactive' },
    'rejected': { tr: 'Reddedildi', en: 'Rejected' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

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

  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

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
    'disputed': { tr: 'Anlaşmazlık', en: 'Disputed' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

export function formatOfferStatus(status: string | null | undefined, locale: string = 'tr'): string {
  if (!status) return locale === 'en' ? 'Unknown' : 'Bilinmiyor';

  const statusMap: Record<string, { tr: string; en: string }> = {
    'pending': { tr: 'Beklemede', en: 'Pending' },
    'accepted': { tr: 'Kabul Edildi', en: 'Accepted' },
    'rejected': { tr: 'Reddedildi', en: 'Rejected' },
    'expired': { tr: 'Süresi Doldu', en: 'Expired' },
    'cancelled': { tr: 'İptal Edildi', en: 'Cancelled' },
    'counter_offered': { tr: 'Karşı Teklif Yapıldı', en: 'Counter Offered' },
    'countered': { tr: 'Karşı Teklif Yapıldı', en: 'Countered' },
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return locale === 'en' ? mapped.en : mapped.tr;
  }

  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/**
 * Relative date formatter: "2 saat önce", "3 gün önce", "tam tarih"
 */
export function formatRelativeDate(date: string | Date | null | undefined, locale: string = 'tr'): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (locale === 'en') {
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hr ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (diffSec < 60) return 'Az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  if (diffHr < 24) return `${diffHr} sa önce`;
  if (diffDay < 7) return `${diffDay} gün önce`;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}
