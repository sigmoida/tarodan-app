import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { appAlert } from '@tarodan/ui-native';
import { useAuthStore } from '../../../../src/stores/authStore';
import {
  useSubscriptionStore,
  isSubscriptionActive,
  getDaysUntilRenewal,
  getSubscriptionStatusText,
} from '../../../../src/stores/subscriptionStore';
import { useTranslation } from '../../../../src/i18n';

/**
 * Subscription settings controller — owns the subscription-store bindings, the
 * focus fetch, error→snackbar effect, cancel/reactivate handlers, and the
 * derived premium/status values. Lifted verbatim from the monolith.
 */
export function useSubscription() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const {
    subscription,
    billingHistory,
    isLoading,
    error,
    fetchSubscription,
    fetchBillingHistory,
    cancelSubscription,
    reactivateSubscription,
    clearError,
  } = useSubscriptionStore();

  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant?: 'default' | 'success' | 'danger';
  }>({ visible: false, message: '' });

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchSubscription();
        fetchBillingHistory();
      }
    }, [isAuthenticated])
  );

  useEffect(() => {
    if (error) {
      setSnackbar({ visible: true, message: error, variant: 'danger' });
      clearError();
    }
  }, [error]);

  const handleCancel = () => {
    appAlert(
      'Aboneliği İptal Et',
      'Aboneliğinizi iptal etmek istediğinize emin misiniz? Dönem sonuna kadar premium özelliklerden yararlanmaya devam edebilirsiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSubscription();
              setSnackbar({ visible: true, message: 'Abonelik iptal edildi', variant: 'success' });
            } catch (e) {
              // Error handled by store
            }
          },
        },
      ]
    );
  };

  const handleReactivate = async () => {
    try {
      await reactivateSubscription();
      setSnackbar({ visible: true, message: 'Abonelik yeniden aktifleştirildi!', variant: 'success' });
    } catch (e) {
      // Error handled by store
    }
  };

  // Web ile aynı mantık (profile/membership/page.tsx): yalnızca AKTİF ve ücretli
  // (free olmayan) üyelik "premium" sayılır. Backend her kullanıcıya aktif bir
  // ücretsiz üyelik açtığı için (status=active, ~100 yıl geçerli), sadece
  // isSubscriptionActive() kontrolü TÜM kullanıcıları (ücretsiz dâhil) premium
  // gösteriyordu. Bu yüzden tier tipini de kontrol ediyoruz.
  const tierType = subscription?.tier?.type ?? 'free';
  const isPremium = !!subscription && isSubscriptionActive(subscription) && tierType !== 'free';
  const isCancelled = subscription?.status === 'cancelled';
  const daysLeft = subscription ? getDaysUntilRenewal(subscription) : 0;
  const statusInfo = subscription ? getSubscriptionStatusText(subscription.status) : null;

  // Map status text color to a Chip variant
  const statusChipVariant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' =
    statusInfo
      ? subscription?.status === 'active'
        ? 'success'
        : subscription?.status === 'cancelled'
          ? 'warning'
          : subscription?.status === 'past_due'
            ? 'danger'
            : 'neutral'
      : 'neutral';

  return {
    t,
    isAuthenticated,
    subscription,
    billingHistory,
    isLoading,
    handleCancel,
    handleReactivate,
    snackbar,
    setSnackbar,
    isPremium,
    isCancelled,
    daysLeft,
    statusInfo,
    statusChipVariant,
  };
}

export type SubscriptionController = ReturnType<typeof useSubscription>;
