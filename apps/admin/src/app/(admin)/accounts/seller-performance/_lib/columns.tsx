import { StatusBadge, Badge } from '@tarodan/ui';
import { col } from '@/components/table';
import { type Seller, membershipConfig } from './types';

export const sellerColumns = [
  col.user<Seller>('Satıcı', (s) => ({ name: s.displayName, secondary: s.email })),
  col.badge<Seller>('Üyelik', (s) => (
    <StatusBadge status={s.membership?.tier?.type ?? 'free'} config={membershipConfig} />
  )),
  col.number<Seller>('Ürün', (s) => s._count.products),
  col.number<Seller>('Sipariş', (s) => s._count.sellerOrders),
  col.badge<Seller>('Durum', (s) =>
    s.isBanned ? (
      <Badge variant="danger">Yasaklı</Badge>
    ) : s.isVerified ? (
      <Badge variant="success">Aktif</Badge>
    ) : (
      <Badge variant="warning">Doğrulanmamış</Badge>
    ),
  ),
];
