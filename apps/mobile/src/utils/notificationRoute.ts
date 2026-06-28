/**
 * Backend `link` alanları WEB rotaları için interpole ediliyor (ör.
 * /listings/:id, /trades/:id, /messages?thread=:id). Mobil expo-router
 * rotaları farklı olduğundan link'i mobil rotaya çeviriyoruz. Eşleşme yoksa
 * null döner → çağıran taraf data tabanlı fallback'e düşer.
 *
 * Hem uygulama içi bildirim listesi (app/(tabs)/notifications.tsx) hem de
 * push bildirimi tap handler'ı (src/services/push.ts) bu fonksiyonu kullanır;
 * aksi halde push ile gelen /messages?thread=<id> mobilde geçersiz rota olup
 * boş ekran açıyordu.
 */
export function toMobileRoute(link: string): string | null {
  if (!link || link.includes('{{')) return null; // interpole edilmemiş şablon
  const [rawPath, rawQuery] = link.split('?');
  const path = rawPath.replace(/\/+$/, '');

  // /messages?thread=<id> → /messages/<id>  (RN'de URLSearchParams'a güvenmeden)
  if (path === '/messages') {
    const thread = rawQuery?.match(/(?:^|&)thread=([^&]+)/)?.[1];
    return thread ? `/messages/${decodeURIComponent(thread)}` : '/(tabs)/messages';
  }
  // /offers?tab=received → /offers
  if (path === '/offers') return '/offers';

  const seg = path.split('/').filter(Boolean);
  const [head, id] = seg;

  switch (head) {
    case 'listings':
      // web: ürün detayı /listings/:id → mobil /product/:id; liste → arama
      return id ? `/product/${id}` : '/(tabs)/search';
    case 'trades':
      // web çoğul → mobil tekil; liste → tab
      return id ? `/trade/${id}` : '/trades';
    case 'profile':
      if (id === 'listings') return '/settings/my-listings';
      if (id === 'earnings') return '/settings/payments';
      return '/(tabs)/profile';
    case 'refund-requests':
      // web /refund-requests/:id → mobil iade detayı (alıcı+satıcı erişebilir);
      // liste → alıcının kendi iade talepleri
      return id ? `/refund-requests/${id}` : '/refund-requests';
    // Mobil rotalarla birebir uyumlu — olduğu gibi geçir
    case 'orders':
    case 'product':
    case 'products': // /products/unavailable/:id
    case 'collections':
    case 'seller':
    case 'favorites':
    case 'pricing':
      return path;
    default:
      return null;
  }
}
