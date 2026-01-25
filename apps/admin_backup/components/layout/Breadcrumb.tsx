'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const pathLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  analytics: 'Analitik',
  sales: 'Satışlar',
  revenue: 'Gelir',
  users: 'Kullanıcılar',
  orders: 'Siparişler',
  products: 'Ürünler',
  pending: 'Onay Bekleyenler',
  reported: 'Şikayet Edilenler',
  settings: 'Ayarlar',
  commission: 'Komisyon',
  general: 'Genel',
  payment: 'Ödeme',
  shipping: 'Kargo',
  notifications: 'Bildirimler',
  sellers: 'Satıcılar',
  suspended: 'Askıya Alınanlar',
  disputes: 'İtirazlar',
  trades: 'Takas',
  messages: 'Mesajlar',
  moderation: 'Moderasyon',
  reports: 'Raporlar',
  support: 'Destek',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const label = pathLabels[segment] || segment;
    const isLast = index === segments.length - 1;

    return { href, label, isLast };
  });

  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
      <Link href="/dashboard" className="hover:text-foreground">
        🏠
      </Link>
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.href} className="flex items-center gap-2">
          <span>/</span>
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground">
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}

export default Breadcrumb;
