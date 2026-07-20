'use client';

import { useParams } from 'next/navigation';
import { StarIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { Button } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { DetailPage } from '@/components/detail/DetailPage';
import { useConfirm } from '@/provider/ConfirmProvider';
import { usePrompt } from '@/provider/PromptProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { type UserDetail } from './types';
import { UserStats } from './_sections/UserStats';
import { UserInfoSection } from './_sections/UserInfoSection';
import { MembershipSection } from './_sections/MembershipSection';
import { UserActivityTabs } from './_sections/UserActivityTabs';
import { UserSidebar } from './_sections/UserSidebar';

export default function UserDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const prompt = usePrompt();

  const ban = useAdminMutation((reason: string) => adminApi.banUser(id, reason), {
    invalidates: ['users'],
    successMessage: t('admin.users.detail.banned'),
  });
  const unban = useAdminMutation(() => adminApi.unbanUser(id), {
    invalidates: ['users'],
    successMessage: t('admin.users.detail.unbanned'),
  });

  const onBan = async () => {
    const reason = await prompt({
      title: t('admin.users.detail.banTitle'),
      label: t('admin.users.detail.banReasonLabel'),
      placeholder: t('admin.users.detail.banReasonPlaceholder'),
      confirmLabel: t('admin.users.detail.banConfirm'),
      requiredMessage: t('admin.users.detail.banReasonRequired'),
      destructive: true,
    });
    if (!reason) return;
    ban.mutate(reason);
  };

  const onUnban = async () => {
    await confirm({
      title: t('admin.users.detail.unbanTitle'),
      description: t('admin.users.detail.unbanConfirmDesc'),
      confirmLabel: t('admin.users.detail.unbanTitle'),
      onConfirm: () => unban.mutateAsync(),
    });
  };

  return (
    <DetailPage<UserDetail>
      resource="users"
      id={id}
      fetcher={(uid) => adminApi.getUser(uid).then((r) => r.data)}
      backHref="/accounts/users"
      emptyTitle={t('admin.users.empty')}
      title={(u) => u.displayName}
      subtitle={(u) => (
        <span className="flex flex-wrap items-center gap-2">
          {u.email}
          {u.averageRating != null && (
            <span className="inline-flex items-center gap-1 text-warning-500">
              <StarIcon className="h-4 w-4 fill-warning-500" />
              {u.averageRating}
              <span className="text-muted">
                {t('admin.users.detail.ratingsCount', {
                  count: u.stats?.receivedRatingsCount || 0,
                })}
              </span>
            </span>
          )}
        </span>
      )}
      badge={(u) =>
        u.isBanned ? (
          <span className="rounded-full bg-danger-500/20 px-3 py-1 text-sm font-medium text-danger-600">
            {t('admin.users.detail.bannedBadge')}
          </span>
        ) : (
          <span className="rounded-full bg-success-500/20 px-3 py-1 text-sm font-medium text-success-700">
            {t('common.active')}
          </span>
        )
      }
      actions={(u) =>
        u.isBanned ? (
          <Button variant="success" onClick={onUnban} isLoading={unban.isPending}>
            {t('admin.users.detail.unbanTitle')}
          </Button>
        ) : (
          <Button variant="danger" onClick={onBan} isLoading={ban.isPending}>
            {t('admin.users.detail.banConfirm')}
          </Button>
        )
      }
    >
      {(u) => (
        <>
          {u.stats && <UserStats stats={u.stats} />}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <UserInfoSection user={u} />
              <MembershipSection userId={u.id} membership={u.membership} />
              <UserActivityTabs userId={u.id} user={u} />
            </div>
            <div className="space-y-6">
              <UserSidebar user={u} />
            </div>
          </div>
        </>
      )}
    </DetailPage>
  );
}
