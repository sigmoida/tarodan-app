import { Badge, enumLabel, membershipTierConfig } from '@tarodan/ui';
import { col, type RowActionItem } from '@/components/table';
import type { User } from './types';

export function userColumns(rowMenu: (u: User) => RowActionItem[]) {
  return [
    col.custom<User>(
      'Kullanıcı',
      (u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 font-medium text-primary-600">
            {u.displayName?.charAt(0) ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-heading">{u.displayName}</p>
            <p className="truncate text-sm text-muted">{u.email}</p>
          </div>
        </div>
      ),
      { grow: 3, minWidth: 220 },
    ),
    col.custom<User>(
      'Durum',
      (u) => (
        <div className="flex flex-col items-start gap-1">
          {u.isSeller && <Badge variant="info">Satıcı</Badge>}
          {u.isVerified && <Badge variant="success">Doğrulanmış</Badge>}
          {u.isBanned && <Badge variant="danger">Engelli</Badge>}
          {!u.isSeller && !u.isVerified && !u.isBanned && <span className="text-muted">—</span>}
        </div>
      ),
      { grow: 1, minWidth: 130 },
    ),
    col.badge<User>('Üyelik', (u) => {
      const tier = (u.membershipTier || '').toLowerCase();
      const label = enumLabel(membershipTierConfig, tier, u.membershipTier || 'Ücretsiz');
      return <Badge variant={tier === 'premium' ? 'warning' : 'default'}>{label}</Badge>;
    }),
    col.number<User>('Sipariş', (u) => u.ordersCount),
    col.number<User>('Ürün', (u) => u.productsCount),
    col.date<User>('Kayıt Tarihi', (u) => u.createdAt),
    col.muted<User>('Son Giriş', (u) =>
      u.lastLoginAt
        ? new Date(u.lastLoginAt).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Hiç giriş yapmadı',
    ),
    col.rowMenu<User>(rowMenu),
  ];
}
