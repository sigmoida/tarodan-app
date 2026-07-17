import { Badge, enumLabel, membershipTierConfig } from '@tarodan/ui';
import { useTranslations } from 'next-intl';
import { col, type RowActionItem } from '@/components/table';
import type { User } from './types';

type T = ReturnType<typeof useTranslations<never>>;

export function userColumns(t: T, rowMenu: (u: User) => RowActionItem[]) {
  return [
    col.custom<User>(
      t('admin.users.columnUser'),
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
      t('common.status'),
      (u) => (
        <div className="flex flex-col items-start gap-1">
          {u.isSeller && <Badge variant="info">{t('admin.users.seller')}</Badge>}
          {u.isVerified && <Badge variant="success">{t('admin.users.verified')}</Badge>}
          {u.isBanned && <Badge variant="danger">{t('admin.users.bannedBadge')}</Badge>}
          {!u.isSeller && !u.isVerified && !u.isBanned && <span className="text-muted">—</span>}
        </div>
      ),
      { grow: 1, minWidth: 130 },
    ),
    col.badge<User>(t('admin.users.membership'), (u) => {
      const tier = (u.membershipTier || '').toLowerCase();
      const label = enumLabel(
        membershipTierConfig,
        tier,
        u.membershipTier || t('admin.users.membershipFree'),
      );
      return <Badge variant={tier === 'premium' ? 'warning' : 'default'}>{label}</Badge>;
    }),
    col.number<User>(t('admin.operations.common.order'), (u) => u.ordersCount),
    col.number<User>(t('admin.catalog.common.product'), (u) => u.productsCount),
    col.date<User>(t('admin.users.registeredAt'), (u) => u.createdAt),
    col.muted<User>(t('admin.users.lastLogin'), (u) =>
      u.lastLoginAt
        ? new Date(u.lastLoginAt).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : t('admin.users.neverLoggedIn'),
    ),
    col.rowMenu<User>(rowMenu),
  ];
}
