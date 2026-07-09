import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { TradeAddressPicker } from '@/components/common';
import { formatPrice } from '@/utils/format';
import type { Trade, TFn } from '../_lib/types';

const { colors } = theme;

export interface TradeActionHandlers {
  setTradeAddressId: (id: string | null) => void;
  handleAccept: () => void;
  acceptPending: boolean;
  openReject: () => void;
  rejectPending: boolean;
  handleCancel: () => void;
  cancelPending: boolean;
  cashPay: () => void;
  cashPayPending: boolean;
  confirm: () => void;
  confirmPending: boolean;
  openDispute: () => void;
}

export function TradeActions({
  trade,
  id,
  t,
  isInitiator,
  isReceiver,
  userId,
  otherPartyId,
  cashPaid,
  cashTotal,
  cashCommission,
  myFromWarehouseStatus,
  actions,
}: {
  trade: Trade;
  id: string;
  t: TFn;
  isInitiator: boolean;
  isReceiver: boolean;
  userId?: string;
  otherPartyId: string;
  cashPaid: boolean;
  cashTotal: number;
  cashCommission: number;
  myFromWarehouseStatus?: string | null;
  actions: TradeActionHandlers;
}) {
  return (
    <View style={styles.actions}>
      {/* Pending: Accept/Reject/Counter for receiver */}
      {trade.status === 'pending' && isReceiver && (
        <>
          <View style={{ marginBottom: 12 }}>
            <TradeAddressPicker label="Teslimat Adresi" onChange={actions.setTradeAddressId} />
          </View>
          <Button
            variant="primary"
            title="Kabul Et"
            onPress={actions.handleAccept}
            isLoading={actions.acceptPending}
            style={styles.actionButton}
          />
          <View style={styles.actionRow}>
            <Button
              variant="outline"
              title="Karşı Teklif"
              onPress={() => router.push(`/trade/counter/${id}` as any)}
              style={{ ...styles.actionButton, ...styles.actionItem }}
            />
            <Button
              variant="outline"
              title="Reddet"
              onPress={actions.openReject}
              isLoading={actions.rejectPending}
              style={{ ...styles.actionButton, ...styles.actionItem, borderColor: colors.danger[600]! }}
            />
          </View>
        </>
      )}

      {/* Cancel — backend-derived. Pending'de yalnızca teklifi yapan iptal edebilir. */}
      {trade.canCancel && (trade.status === 'pending' ? isInitiator : isInitiator || isReceiver) && (
        <Button
          variant="outline"
          title={trade.status === 'pending' ? t('trade.cancel.offerCta') : t('trade.cancel.tradeCta')}
          onPress={actions.handleCancel}
          isLoading={actions.cancelPending}
          style={{ ...styles.actionButton, borderColor: colors.danger[600]! }}
        />
      )}

      {/* Cancel locked hint */}
      {!trade.canCancel &&
        trade.status === 'shipping_to_warehouse' &&
        trade.firstWarehouseArrivalAt &&
        (isInitiator || isReceiver) && (
          <Text variant="caption" style={styles.confirmReceiptHint}>{t('trade.cancel.lockedHint')}</Text>
        )}

      {/* awaiting_payment: cashPayer must initiate the cash payment */}
      {(trade.status === 'accepted' || trade.status === 'awaiting_payment') &&
        trade.cashPayerId === userId &&
        !cashPaid && (
          <View style={styles.payCta}>
            <Text variant="label" style={{ color: colors.primary[800]! }}>Ödemenizi Tamamlayın</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2, marginBottom: 10 }}>
              Takas kabul edildi. Devam etmek için nakit fark ödemesini tamamlayın.
            </Text>
            <Button
              testID="cash-pay-button"
              variant="primary"
              title={`Ödeme Yap — ${formatPrice(Math.abs(cashTotal > 0 ? cashTotal : Number(trade.cashAmount ?? 0)))}${cashCommission > 0 ? ' (komisyon dahil)' : ''}`}
              onPress={actions.cashPay}
              isLoading={actions.cashPayPending}
              disabled={actions.cashPayPending}
              style={styles.actionButton}
            />
          </View>
        )}
      {(trade.status === 'accepted' || trade.status === 'awaiting_payment') &&
        trade.cashPayerId &&
        trade.cashPayerId !== userId &&
        !cashPaid && (
          <Text variant="caption" style={styles.confirmReceiptHint}>
            Karşı tarafın nakit fark ödemesi bekleniyor.
          </Text>
        )}

      {/* shipping_to_recipients: Confirm receipt (gated by delivered status) */}
      {trade.status === 'shipping_to_recipients' && (isInitiator || isReceiver) && (
        <>
          <Button
            testID="trade-confirm-delivery-button"
            variant="primary"
            title="Teslim Aldım"
            onPress={actions.confirm}
            isLoading={actions.confirmPending}
            disabled={myFromWarehouseStatus !== 'delivered'}
            style={styles.actionButton}
          />
          {myFromWarehouseStatus !== 'delivered' && (
            <Text variant="caption" style={styles.confirmReceiptHint}>{t('trade.confirmReceipt.waitingDelivered')}</Text>
          )}
          <Button
            testID="trade-raise-dispute-button"
            variant="outline"
            title={t('trade.dispute.openCta')}
            onPress={actions.openDispute}
            style={{ ...styles.actionButton, borderColor: colors.danger[600]! }}
          />
          <Text variant="caption" style={styles.confirmReceiptHint}>{t('trade.dispute.hint')}</Text>
        </>
      )}

      {/* Message other party */}
      <Button
        variant="ghost"
        title="Mesaj Gönder"
        onPress={() => router.push(`/messages/new?receiverId=${otherPartyId}`)}
        style={styles.actionButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { padding: 16, gap: 12 },
  actionButton: { borderRadius: 8, alignSelf: 'stretch' },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionItem: { flex: 1 },
  confirmReceiptHint: { color: colors.text.muted, textAlign: 'center', marginTop: 4 },
  payCta: {
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[100]!,
    borderRadius: 12,
    padding: 14,
  },
});
