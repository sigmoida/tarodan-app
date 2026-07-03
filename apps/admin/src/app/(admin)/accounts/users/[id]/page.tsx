'use client';

import { useParams } from 'next/navigation';
import { StarIcon } from '@heroicons/react/24/outline';
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
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const prompt = usePrompt();

  const ban = useAdminMutation((reason: string) => adminApi.banUser(id, reason), {
    invalidates: ['users'],
    successMessage: 'Kullanıcı banlandı',
  });
  const unban = useAdminMutation(() => adminApi.unbanUser(id), {
    invalidates: ['users'],
    successMessage: 'Kullanıcı banı kaldırıldı',
  });

  const onBan = async () => {
    const reason = await prompt({
      title: 'Kullanıcıyı Banla',
      label: 'Ban Nedeni',
      placeholder: 'Ban nedenini açıklayın...',
      confirmLabel: 'Banla',
      requiredMessage: 'Ban nedeni gereklidir',
      destructive: true,
    });
    if (!reason) return;
    ban.mutate(reason);
  };

  const onUnban = async () => {
    const ok = await confirm({
      title: 'Banı Kaldır',
      description: 'Bu kullanıcının banını kaldırmak istediğinizden emin misiniz?',
      confirmLabel: 'Banı Kaldır',
    });
    if (ok) unban.mutate();
  };

  return (
    <DetailPage<UserDetail>
      resource="users"
      id={id}
      fetcher={(uid) => adminApi.getUser(uid).then((r) => r.data)}
      backHref="/accounts/users"
      emptyTitle="Kullanıcı bulunamadı"
      title={(u) => u.displayName}
      subtitle={(u) => (
        <span className="flex flex-wrap items-center gap-2">
          {u.email}
          {u.averageRating != null && (
            <span className="inline-flex items-center gap-1 text-warning-500">
              <StarIcon className="h-4 w-4 fill-warning-500" />
              {u.averageRating}
              <span className="text-muted">
                ({u.stats?.receivedRatingsCount || 0} değerlendirme)
              </span>
            </span>
          )}
        </span>
      )}
      badge={(u) =>
        u.isBanned ? (
          <span className="rounded-full bg-danger-500/20 px-3 py-1 text-sm font-medium text-danger-600">
            Banlı
          </span>
        ) : (
          <span className="rounded-full bg-success-500/20 px-3 py-1 text-sm font-medium text-success-700">
            Aktif
          </span>
        )
      }
      actions={(u) =>
        u.isBanned ? (
          <Button variant="success" onClick={onUnban} isLoading={unban.isPending}>
            Banı Kaldır
          </Button>
        ) : (
          <Button variant="danger" onClick={onBan} isLoading={ban.isPending}>
            Banla
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
