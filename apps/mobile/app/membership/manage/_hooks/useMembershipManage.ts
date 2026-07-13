import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { useRefresh } from '@/hooks/useRefresh';
import { membershipApi } from '@/services/api';
import { captureException } from '@/services/sentry';
import { TIER_NAMES, type MembershipMe } from '../_lib/types';

/**
 * Membership-manage controller — owns GET /membership/me, the cancel and
 * auto-renew mutations, derived tier flags, handlers and the snackbar. Lifted
 * verbatim from the monolithic screen (§12).
 */
export function useMembershipManage() {
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const { data, isLoading, refetch } = useQuery<MembershipMe | null>({
    queryKey: ['membership', 'me'],
    queryFn: async () => {
      const response = await membershipApi.getCurrentMembership();
      return response.data?.data ?? response.data ?? null;
    },
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  const tier = (data?.tier?.type ?? data?.tierType ?? 'free').toLowerCase();
  const tierName = data?.tier?.name ?? data?.tierName ?? TIER_NAMES[tier] ?? 'Ücretsiz Üyelik';
  const isPaid = tier !== 'free';
  const isCancelled = (data?.status ?? '').toLowerCase() === 'cancelled';
  const autoRenew = !!data?.autoRenew;

  const cancelMutation = useMutation({
    mutationFn: () => membershipApi.cancel(),
    onSuccess: () => {
      setSnackbar({ visible: true, message: 'Üyelik iptal talebi alındı.' });
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      refetch();
    },
    onError: (error: any) => {
      captureException(error, { level: 'error', tags: { flow: 'membership.cancel' } });
      const msg = error?.response?.data?.message || 'İptal işlemi başarısız.';
      setSnackbar({ visible: true, message: typeof msg === 'string' ? msg : 'İptal işlemi başarısız.' });
    },
  });

  const autoRenewMutation = useMutation({
    mutationFn: (next: boolean) => membershipApi.setAutoRenew(next),
    onSuccess: (_res, next) => {
      setSnackbar({
        visible: true,
        message: next ? 'Otomatik yenileme açıldı.' : 'Otomatik yenileme kapatıldı.',
      });
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      refetch();
    },
    onError: (error: any) => {
      captureException(error, { level: 'error', tags: { flow: 'membership.autoRenew' } });
      const msg = error?.response?.data?.message || 'İşlem başarısız.';
      setSnackbar({ visible: true, message: typeof msg === 'string' ? msg : 'İşlem başarısız.' });
    },
  });

  const handleCancel = () => {
    appAlert(
      'Üyeliği İptal Et',
      'Üyeliğinizi iptal etmek istediğinize emin misiniz? Mevcut dönem sonuna kadar özelliklerinizi kullanmaya devam edebilirsiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İptal Et', style: 'destructive', onPress: () => cancelMutation.mutate() },
      ],
    );
  };

  const handleToggleAutoRenew = () => {
    autoRenewMutation.mutate(!autoRenew);
  };

  return {
    data,
    isLoading,
    refreshing,
    onRefresh,
    tierName,
    isPaid,
    isCancelled,
    autoRenew,
    cancelMutation,
    autoRenewMutation,
    handleCancel,
    handleToggleAutoRenew,
    snackbar,
    setSnackbar,
  };
}

export type MembershipManageController = ReturnType<typeof useMembershipManage>;
