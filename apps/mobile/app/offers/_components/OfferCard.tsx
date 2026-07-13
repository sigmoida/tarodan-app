import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';
import { transformImageUrl } from '@/utils/imageUrl';
import type { Offer, TabType } from '../_lib/types';
import {
  statusConfig,
  getProductImage,
  getTimeRemaining,
  formatTimeAgo,
  formatPrice,
} from '../_lib/status';

const { colors } = theme;

export interface OfferCardProps {
  offer: Offer;
  tab: TabType;
  estimatedNet?: number;
  isPending: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenCounter: (offer: Offer) => void;
  onOpenBuyerCounter: (offer: Offer) => void;
}

function OfferCardBase({
  offer,
  tab,
  estimatedNet,
  isPending,
  t,
  onAccept,
  onReject,
  onCancel,
  onOpenCounter,
  onOpenBuyerCounter,
}: OfferCardProps) {
  const status = statusConfig(offer.status);
  const otherUser = tab === 'received' ? offer.buyer : offer.seller;
  const timeRemaining = offer.status === 'pending' ? getTimeRemaining(offer.expiresAt) : null;

  return (
    <View style={styles.card}>
      {/* Top row: image + info */}
      <View style={styles.cardRow}>
        <TouchableOpacity onPress={() => router.push(`/product/${offer.product.id}` as any)}>
          <Image source={{ uri: getProductImage(offer.product) }} style={styles.productImage} />
        </TouchableOpacity>

        <View style={styles.cardContent}>
          <TouchableOpacity onPress={() => router.push(`/product/${offer.product.id}` as any)}>
            <Text style={styles.productTitle} numberOfLines={2}>{offer.product.title}</Text>
          </TouchableOpacity>

          <Text style={styles.originalPrice}>
            İlan Fiyatı: <Text style={styles.strikethrough}>{formatPrice(offer.product.price)}</Text>
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Ionicons name={status.icon} size={14} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>

          {tab === 'sent' && offer.status === 'pending' && offer.buyerMustAccept ? (
            <View style={styles.counterAlertBadge}>
              <Ionicons name="swap-horizontal" size={14} color={colors.white} />
              <Text style={styles.counterAlertText}>Satıcıdan karşı teklif · yanıtlayın</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Offer amount */}
      <View style={styles.amountRow}>
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Teklif Tutarı</Text>
          <Text style={styles.amountValue}>{formatPrice(offer.amount)}</Text>
        </View>

        {estimatedNet != null && (
          <View style={styles.netBox}>
            <Text style={styles.netLabel}>Tahmini net (satıcı)</Text>
            <Text style={styles.netValue}>{formatPrice(estimatedNet)}</Text>
          </View>
        )}

        {timeRemaining && (
          <View style={styles.timeBox}>
            <Ionicons name="time-outline" size={14} color={colors.warning[600]!} />
            <Text style={styles.timeText}>{timeRemaining} kaldı</Text>
          </View>
        )}
      </View>

      {/* Other user */}
      {otherUser && (
        <View style={styles.userRow}>
          {otherUser.avatarUrl ? (
            <Image source={{ uri: transformImageUrl(otherUser.avatarUrl) }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={16} color={colors.text.subtle} />
            </View>
          )}
          <View>
            <Text style={styles.userLabel}>{tab === 'received' ? 'Teklif Veren' : 'Satıcı'}</Text>
            <Text style={styles.userName}>{otherUser.displayName}</Text>
          </View>
        </View>
      )}

      {/* Message */}
      {offer.message ? (
        <View style={styles.messageBox}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.text.subtle} style={{ marginTop: 2 }} />
          <Text style={styles.messageText}>"{offer.message}"</Text>
        </View>
      ) : null}

      {/* Date */}
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={14} color={colors.text.subtle} />
        <Text style={styles.dateText}>{formatTimeAgo(offer.createdAt, t)}</Text>
      </View>

      {/* Actions */}
      {offer.status === 'pending' && (
        <View style={styles.actionsRow}>
          {tab === 'received' && offer.buyerMustAccept ? (
            <View style={styles.waitingBanner}>
              <Ionicons name="time-outline" size={18} color={colors.warning[700]!} />
              <Text style={styles.waitingBannerText}>
                Alıcının karşı teklifinizi kabul veya reddetmesi bekleniyor.
              </Text>
            </View>
          ) : tab === 'received' ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={() => onAccept(offer.id)}
                disabled={isPending}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color={colors.white} />
                    <Text style={styles.actionBtnText}>Kabul Et</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => onReject(offer.id)}
                disabled={isPending}
              >
                <Ionicons name="close" size={16} color={colors.white} />
                <Text style={styles.actionBtnText}>Reddet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.counterBtn]}
                onPress={() => onOpenCounter(offer)}
                disabled={isPending}
              >
                <Ionicons name="swap-horizontal" size={16} color={colors.white} />
                <Text style={styles.actionBtnText}>Karşı Teklif</Text>
              </TouchableOpacity>
            </>
          ) : offer.buyerMustAccept ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={() => onAccept(offer.id)}
                disabled={isPending}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color={colors.white} />
                    <Text style={styles.actionBtnText}>Karşı teklifi kabul et</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => onReject(offer.id)}
                disabled={isPending}
              >
                <Ionicons name="close" size={16} color={colors.white} />
                <Text style={styles.actionBtnText}>Reddet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.counterBtn]}
                onPress={() => onOpenBuyerCounter(offer)}
                disabled={isPending}
              >
                <Ionicons name="trending-down" size={16} color={colors.white} />
                <Text style={styles.actionBtnText}>Daha düşük teklif</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => onCancel(offer.id)}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="close" size={16} color={colors.white} />
                  <Text style={styles.actionBtnText}>İptal Et</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Accepted → ödeme bekliyorsa "Ödeme Yap", aksi halde sipariş linki */}
      {offer.status === 'accepted' && offer.orderId && (
        offer.orderStatus === 'pending_payment' ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.payBtn, { alignSelf: 'flex-start', marginTop: 12 }]}
            onPress={() =>
              router.push({
                pathname: '/payment/[id]',
                params: { id: offer.orderId!, orderId: offer.orderId!, provider: 'paytr', guest: '0' },
              } as any)
            }
          >
            <Ionicons name="card-outline" size={16} color={colors.white} />
            <Text style={styles.actionBtnText}>Ödeme Yap · {formatPrice(offer.amount)}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.orderBtn, { alignSelf: 'flex-start', marginTop: 12 }]}
            onPress={() => router.push({ pathname: '/orders/[id]', params: { id: offer.orderId! } } as any)}
          >
            <Ionicons name="cube-outline" size={16} color={colors.white} />
            <Text style={styles.actionBtnText}>Siparişi Görüntüle</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.elevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  productImage: { width: 80, height: 80, borderRadius: 8, backgroundColor: colors.gray[100]! },
  cardContent: { flex: 1, gap: 4 },
  productTitle: { fontSize: 15, fontWeight: '600', color: colors.text.heading, lineHeight: 20 },
  originalPrice: { fontSize: 12, color: colors.text.subtle, marginTop: 2 },
  strikethrough: { textDecorationLine: 'line-through' },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  counterAlertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    backgroundColor: colors.info[600]!,
  },
  counterAlertText: { fontSize: 11, fontWeight: '700', color: colors.white },

  amountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  amountBox: {
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[100]!,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  amountLabel: { fontSize: 10, color: colors.text.subtle, marginBottom: 2 },
  amountValue: { fontSize: 20, fontWeight: '700', color: colors.primary[600]! },
  netBox: {
    backgroundColor: colors.success[100]!,
    borderWidth: 1,
    borderColor: colors.success[300]!,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
    minWidth: 0,
  },
  netLabel: { fontSize: 10, color: colors.text.subtle, marginBottom: 2 },
  netValue: { fontSize: 16, fontWeight: '700', color: colors.success[600]! },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warning[100]!,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeText: { fontSize: 12, fontWeight: '600', color: colors.warning[600]! },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[100]! },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  userLabel: { fontSize: 10, color: colors.text.subtle },
  userName: { fontSize: 13, fontWeight: '600', color: colors.text.heading },

  messageBox: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.muted,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  dateText: { fontSize: 12, color: colors.text.subtle },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: '100%',
    backgroundColor: colors.warning[100]!,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  waitingBannerText: { flex: 1, fontSize: 13, color: colors.warning[800]!, lineHeight: 18 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  actionBtnText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  acceptBtn: { backgroundColor: colors.success[600]! },
  rejectBtn: { backgroundColor: colors.danger[600]! },
  counterBtn: { backgroundColor: colors.info[600]! },
  cancelBtn: { backgroundColor: colors.gray[500]! },
  orderBtn: { backgroundColor: colors.primary[600]! },
  payBtn: { backgroundColor: colors.success[600]! },
});

export const OfferCard = React.memo(OfferCardBase);
