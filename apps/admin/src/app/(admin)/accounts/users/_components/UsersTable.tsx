'use client';

import { useRouter } from 'next/navigation';
import { Badge, enumLabel, membershipTierConfig } from '@tarodan/ui';
import { NoSymbolIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { col } from '@/components/table';
import { ActionButtons, ActionIconButton } from '@/components/admin-list';
import { ResourceList } from '@/components/list';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { usePrompt } from '@/components/PromptProvider';
import { type User } from '../_lib/types';

/**
 * The users table — ban/unban row action lives here as mutations; rows come from
 * the ResourceList context (already mapped to `User` by the page fetcher).
 */
export function UsersTable() {
  const router = useRouter();
  const prompt = usePrompt();

  const ban = useAdminMutation(
    (v: { id: string; reason: string }) => adminApi.banUser(v.id, v.reason),
    { invalidates: ['users'], successMessage: 'Kullanıcı engellendi' },
  );
  const unban = useAdminMutation((id: string) => adminApi.unbanUser(id), {
    invalidates: ['users'],
    successMessage: 'Kullanıcı engeli kaldırıldı',
  });

  const onBanToggle = async (u: User) => {
    if (u.isBanned) {
      unban.mutate(u.id);
      return;
    }
    const reason = await prompt({
      title: 'Kullanıcıyı Engelle',
      label: 'Engelleme sebebi (isteğe bağlı)',
      defaultValue: 'Admin tarafından engellendi',
      confirmLabel: 'Engelle',
      destructive: true,
      required: false,
    });
    if (reason === null) return;
    ban.mutate({ id: u.id, reason: reason || 'Admin tarafından engellendi' });
  };

  const columns = [
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
          {!u.isSeller && !u.isVerified && !u.isBanned && (
            <span className="text-muted">—</span>
          )}
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
    col.actions<User>(
      (u) => (
        <ActionButtons>
          <ActionIconButton
            icon={u.isBanned ? CheckCircleIcon : NoSymbolIcon}
            onClick={() => onBanToggle(u)}
            title={u.isBanned ? 'Engeli Kaldır' : 'Engelle'}
            variant={u.isBanned ? 'success' : 'danger'}
          />
        </ActionButtons>
      ),
      { header: 'İşlemler' },
    ),
  ];

  return (
    <ResourceList.Table
      columns={columns}
      onRowClick={(u) => router.push(`/accounts/users/${u.id}`)}
      emptyText="Kullanıcı bulunamadı"
    />
  );
}
