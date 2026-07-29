'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations();
  const router = useRouter();
  const prompt = usePrompt();

  const ban = useAdminMutation(
    (v: { id: string; reason: string }) => adminApi.banUser(v.id, v.reason),
    { invalidates: ['users'], successMessage: t('admin.users.banned') },
  );
  const unban = useAdminMutation((id: string) => adminApi.unbanUser(id), {
    invalidates: ['users'],
    successMessage: t('admin.users.unbanned'),
  });

  const onBanToggle = async (u: User) => {
    if (u.isBanned) {
      unban.mutate(u.id);
      return;
    }
    const defaultReason = t('admin.users.banDefaultReason');
    const reason = await prompt({
      title: t('admin.users.banTitle'),
      label: t('admin.users.banReasonLabel'),
      defaultValue: defaultReason,
      confirmLabel: t('admin.users.banAction'),
      destructive: true,
      required: false,
    });
    if (reason === null) return;
    ban.mutate({ id: u.id, reason: reason || defaultReason });
  };

  const columns = userColumns(
    t,
    userRowMenu(t, {
      onView: (u) => router.push(`/accounts/users/${u.id}`),
      onBanToggle,
      busyId: ban.isPending
        ? ban.variables?.id
        : unban.isPending
          ? unban.variables
          : undefined,
    }),
  );

  return <ResourceList.Table columns={columns} emptyText={t('admin.users.empty')} />;
}
