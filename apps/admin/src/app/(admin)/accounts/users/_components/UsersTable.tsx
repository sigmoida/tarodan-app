'use client';

import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { usePrompt } from '@/provider/PromptProvider';
import { userColumns } from '../_lib/columns';
import { userRowMenu } from '../_lib/rowActions';
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

  const columns = userColumns(
    userRowMenu({ onView: (u) => router.push(`/accounts/users/${u.id}`), onBanToggle }),
  );

  return <ResourceList.Table columns={columns} emptyText="Kullanıcı bulunamadı" />;
}
