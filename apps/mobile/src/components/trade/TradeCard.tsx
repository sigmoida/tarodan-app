import React, { useState } from 'react';
import { View, StyleSheet, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { theme, Text, Chip, Avatar, type ChipVariant } from '@tarodan/ui-native';
import { formatPrice } from '../../utils/format';
import { transformImageUrl } from '../../utils/imageUrl';

const { colors, spacing, radius } = theme;

const FALLBACK_IMG = 'https://placehold.co/120x120/f3f4f6/9ca3af?text=%C3%9Cr%C3%BCn';

/** Takas statüsü → rozet etiketi/rengi. Depo-escrow akışını da kapsar. */
export const TRADE_STATUSES: Record<string, { label: string; variant: ChipVariant }> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  accepted: { label: 'Kabul Edildi', variant: 'success' },
  awaiting_payment: { label: 'Ödeme Bekleniyor', variant: 'warning' },
  shipping_to_warehouse: { label: 'Depoya Gönderim', variant: 'info' },
  at_warehouse: { label: 'Depoda', variant: 'primary' },
  admin_reviewing: { label: 'İnceleniyor', variant: 'info' },
  shipping_to_recipients: { label: 'Size Gönderiliyor', variant: 'primary' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'neutral' },
  disputed: { label: 'İtiraz', variant: 'danger' },
  countered: { label: 'Karşı Teklif', variant: 'info' },
  // Legacy escrow statuses (pre-warehouse flow) kept for old trades
  initiator_shipped: { label: 'Kargoda', variant: 'info' },
  receiver_shipped: { label: 'Kargoda', variant: 'info' },
  both_shipped: { label: 'Kargoda', variant: 'info' },
  initiator_received: { label: 'Teslim', variant: 'primary' },
  receiver_received: { label: 'Teslim', variant: 'primary' },
};

export function getTradeStatusInfo(status: string): { label: string; variant: ChipVariant } {
  return TRADE_STATUSES[status] || { label: status, variant: 'neutral' };
}

export interface TradeCardItem {
  id?: string | number;
  productId?: string;
  productTitle?: string;
  productImage?: string;
  productImages?: Array<{ cardUrl?: string; detailUrl?: string }>;
  quantity?: number;
  valueAtTrade?: number;
}

export interface TradeCardTrade {
  id: string | number;
  tradeNumber?: string;
  status: string;
  createdAt: string;
  cashAmount?: number | string | null;
  initiatorId?: string;
  receiverId?: string;
  initiatorName?: string;
  receiverName?: string;
  initiator?: { id?: string; displayName?: string };
  receiver?: { id?: string; displayName?: string };
  initiatorItems?: TradeCardItem[];
  receiverItems?: TradeCardItem[];
}

function itemImageUrl(item: TradeCardItem): string {
  const raw =
    item.productImages?.[0]?.cardUrl ??
    item.productImages?.[0]?.detailUrl ??
    item.productImage;
  return raw ? transformImageUrl(raw) : FALLBACK_IMG;
}

function sideTotal(items: TradeCardItem[]): number {
  return items.reduce(
    (sum, it) => sum + (Number(it.valueAtTrade) || 0) * (Number(it.quantity) || 1),
    0,
  );
}

/** Tek bir takas ürünü satırı — küçük görsel + başlık + adet·değer.
 * showPrice=false (tek ürünlü tarafta) satır fiyatı gizlenir; tutar zaten
 * başlık satırındaki toplamda görünüyor. */
function ItemRow({ item, showPrice }: { item: TradeCardItem; showPrice: boolean }) {
  const [src, setSrc] = useState<string>(() => itemImageUrl(item));
  const qty = Number(item.quantity) || 1;
  const subtitle = showPrice
    ? `${qty > 1 ? `${qty}x · ` : ''}${formatPrice(item.valueAtTrade)}`
    : qty > 1
      ? `${qty} adet`
      : null;
  return (
    <View style={styles.itemRow}>
      <Image
        source={{ uri: src }}
        style={styles.thumb}
        onError={() => setSrc(FALLBACK_IMG)}
      />
      <View style={styles.itemBody}>
        <Text variant="bodySm" weight="medium" numberOfLines={subtitle ? 1 : 2}>
          {item.productTitle || 'Ürün'}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Bir tarafın başlığı (etiket + toplam aynı satırda) ve ürün satırları. */
function TradeSide({ label, items }: { label: string; items: TradeCardItem[] }) {
  return (
    <View>
      <View style={styles.sideHeader}>
        <Text variant="overline" tone="muted">
          {label}
        </Text>
        {items.length > 0 ? (
          <Text variant="bodySm" weight="bold" style={styles.sideTotal}>
            {formatPrice(sideTotal(items))}
          </Text>
        ) : null}
      </View>
      <View style={styles.itemList}>
        {items.length > 0 ? (
          items.map((item, idx) => (
            <ItemRow key={item.id ?? idx} item={item} showPrice={items.length > 1} />
          ))
        ) : (
          <Text variant="caption" tone="subtle">
            Ürün yok
          </Text>
        )}
      </View>
    </View>
  );
}

export interface TradeCardProps {
  trade: TradeCardTrade;
  /** Giriş yapan kullanıcının id'si — gönderilen/alınan ayrımı için. */
  currentUserId?: string;
  onPress?: () => void;
}

export function TradeCard({ trade, currentUserId, onPress }: TradeCardProps) {
  const statusInfo = getTradeStatusInfo(trade.status);
  const isSent = !!currentUserId && trade.initiatorId === currentUserId;

  const otherUserName = isSent
    ? trade.receiverName || trade.receiver?.displayName || 'Kullanıcı'
    : trade.initiatorName || trade.initiator?.displayName || 'Kullanıcı';

  const myItems = (isSent ? trade.initiatorItems : trade.receiverItems) ?? [];
  const theirItems = (isSent ? trade.receiverItems : trade.initiatorItems) ?? [];

  const cash = trade.cashAmount != null ? Math.abs(Number(trade.cashAmount)) : 0;

  const handlePress = () => {
    if (onPress) return onPress();
    router.push(`/trade/${trade.id}`);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Avatar name={otherUserName} size="md" />
        <View style={styles.headerText}>
          <Text variant="caption" tone="muted">
            {isSent ? 'Gönderdiğim' : 'Aldığım'}
          </Text>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {otherUserName}
          </Text>
        </View>
        <Chip label={statusInfo.label} variant={statusInfo.variant} size="sm" />
      </View>

      {/* Trade panel */}
      <View style={styles.panel}>
        <TradeSide label="Senin Ürünlerin" items={myItems} />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.swapCircle}>
            <Ionicons name="swap-vertical" size={15} color={colors.primary[600]!} />
          </View>
          <View style={styles.dividerLine} />
        </View>

        <TradeSide label="Karşı Tarafın Ürünleri" items={theirItems} />
      </View>

      {/* Cash difference */}
      {cash > 0 ? (
        <View style={styles.cashRow}>
          <Ionicons name="cash-outline" size={16} color={colors.primary[700]!} />
          <Text variant="caption" tone="muted">
            Nakit fark
          </Text>
          <Text variant="bodySm" tone="primary" weight="bold" style={styles.cashAmount}>
            {formatPrice(cash)}
          </Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={styles.footer}>
        <Text variant="caption" tone="subtle" numberOfLines={1} style={{ flex: 1 }}>
          {format(new Date(trade.createdAt), 'd MMM yyyy', { locale: tr })}
          {trade.tradeNumber ? `  ·  #${trade.tradeNumber}` : ''}
        </Text>
        <View style={styles.detailLink}>
          <Text variant="caption" tone="primary" weight="medium">
            Detaylar
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary[600]!} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    padding: spacing[3.5],
    marginBottom: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2.5],
    marginBottom: spacing[3],
  },
  headerText: {
    flex: 1,
  },

  // ===== Trade panel =====
  panel: {
    backgroundColor: colors.surface.alt,
    borderRadius: radius.lg,
    padding: spacing[3],
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideTotal: {
    color: colors.text.heading,
  },
  itemList: {
    gap: spacing[2],
    marginTop: spacing[2],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2.5],
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.border.subtle,
  },
  itemBody: {
    flex: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginVertical: spacing[2.5],
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.DEFAULT,
  },
  swapCircle: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.primary[100]!,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== Cash =====
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[3],
    backgroundColor: colors.primary[50]!,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
  },
  cashAmount: {
    marginLeft: 'auto',
  },

  // ===== Footer =====
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    marginTop: spacing[3],
    paddingTop: spacing[2.5],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  detailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
});

export default TradeCard;
