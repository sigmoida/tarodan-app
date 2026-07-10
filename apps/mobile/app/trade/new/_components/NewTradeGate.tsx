import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, ScreenHeader, Text, theme } from '@tarodan/ui-native';

import { getUpgradeMessage } from '@/utils/membershipLimits';
import { styles } from '../_lib/styles';
import type { NewTradeController } from '../_hooks/useNewTrade';

const { colors } = theme;

/**
 * Renders the premium-required or not-authenticated gate, or `null` when the
 * wizard itself should render. Keeps the early-return ladder out of the screen.
 */
export function NewTradeGate({ f }: { f: NewTradeController }) {
  if (!f.canTrade) {
    const upgradeInfo = getUpgradeMessage('tradeFeature');
    return (
      <View style={styles.container}>
        <ScreenHeader title="Takas Teklifi" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

        <View style={styles.premiumRequired}>
          <MaterialCommunityIcons name="swap-horizontal" size={80} color={colors.primary[600]!} />
          <Text variant="h2" style={styles.premiumTitle}>{upgradeInfo.title}</Text>
          <Text variant="body" style={styles.premiumSubtitle}>{upgradeInfo.message}</Text>

          <View style={styles.premiumFeatures}>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Takas teklifi oluşturun</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Karşı teklif yapın</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Nakit fark ekleyin</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Takas koruma programı</Text>
            </View>
          </View>

          <Button variant="primary" title="Üyelik Planları" onPress={() => router.push('/membership')} style={styles.upgradeButton} />
          <Button variant="ghost" title="Geri Dön" onPress={() => router.back()} style={{ alignSelf: 'center' }} />
        </View>
      </View>
    );
  }

  if (!f.isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h3">Giriş Yapın</Text>
        <Text variant="body" style={styles.subtitle}>Takas teklifi vermek için giriş yapmalısınız</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return null;
}
