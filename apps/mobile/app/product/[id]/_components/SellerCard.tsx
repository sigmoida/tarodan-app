import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Avatar, IconButton, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveAvatarSource } from '@/utils/imageUrl';
import type { ProductSeller } from '../_lib/types';

const { colors } = theme;

export function SellerCard({
  seller,
  onPressSeller,
  onMessage,
}: {
  seller: ProductSeller | undefined;
  onPressSeller: () => void;
  onMessage: () => void;
}) {
  return (
    <Pressable style={styles.sellerCard} onPress={onPressSeller}>
      <Avatar size="lg" name={seller?.displayName || 'Satıcı'} source={resolveAvatarSource(seller?.avatarUrl)} />
      <View style={styles.sellerInfo}>
        <View style={styles.sellerNameRow}>
          <Text style={styles.sellerName}>{seller?.displayName}</Text>
          {seller?.verified && <Ionicons name="checkmark-circle" size={18} color={colors.success[500]!} />}
        </View>
        <View style={styles.sellerStats}>
          <View style={styles.sellerStat}>
            <Ionicons name="star" size={14} color={colors.warning[500]!} />
            <Text style={styles.sellerStatText}>{seller?.rating || 0}</Text>
          </View>
          <View style={styles.sellerStat}>
            <Ionicons name="bag-check-outline" size={14} color={colors.text.muted} />
            <Text style={styles.sellerStatText}>{seller?.totalSales || 0} satış</Text>
          </View>
        </View>
        <Text style={styles.sellerResponseTime}>Yanıt süresi: {seller?.responseTime || 'Bilinmiyor'}</Text>
      </View>
      <View style={styles.sellerAction}>
        <IconButton
          icon="chatbubble-outline"
          size="sm"
          color={colors.primary[600]!}
          style={styles.messageButton}
          onPress={onMessage}
          accessibilityLabel="Satıcıya mesaj gönder"
        />
        <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: theme.spacing[4],
  },
  sellerInfo: { flex: 1, marginLeft: theme.spacing[3] },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1.5] },
  sellerName: { fontSize: 16, fontWeight: '600', color: colors.text.heading },
  sellerStats: { flexDirection: 'row', gap: theme.spacing[3], marginTop: theme.spacing[1] },
  sellerStat: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
  sellerStatText: { fontSize: 13, color: colors.text.muted },
  sellerResponseTime: { fontSize: 12, color: colors.text.muted, marginTop: theme.spacing[1] },
  sellerAction: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  messageButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary[600]! },
});
