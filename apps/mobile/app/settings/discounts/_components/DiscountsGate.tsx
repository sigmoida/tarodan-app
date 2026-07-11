import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ScreenHeader } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import type { DiscountsController } from '../_hooks/useDiscounts';

/**
 * Auth + seller gate for the discounts screen, or `null` when the screen itself
 * should render. Matches the web parity rules (checked after hooks run).
 */
export function DiscountsGate({ f }: { f: DiscountsController }) {
  if (!f.isAuthenticated) {
    return (
      <View style={styles.gateContainer}>
        <ScreenHeader title="İndirimlerim" />
        <EmptyState
          icon="lock-closed-outline"
          title="Giriş Gerekli"
          subtitle="İndirimlerinizi yönetmek için giriş yapmalısınız."
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login' as any)}
        />
      </View>
    );
  }

  if (f.user && f.user.isSeller === false) {
    return (
      <View style={styles.gateContainer}>
        <ScreenHeader title="İndirimlerim" />
        <EmptyState
          icon="storefront-outline"
          title="Satıcı Olun"
          subtitle="İndirim oluşturmak için satıcı hesabı gerekli."
          actionLabel="Satıcı Ol"
          onAction={() => router.push('/seller/register' as any)}
        />
      </View>
    );
  }

  return null;
}
