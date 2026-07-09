import React from 'react';
import { View, Pressable, Linking, StyleSheet } from 'react-native';
import { Card, Text, Button, theme } from '@tarodan/ui-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ShipmentStatusChip } from './ShipmentStatusChip';
import { renderOtherShipmentHint } from '../_lib/status';
import type { Trade, TFn, TradeShipment } from '../_lib/types';
import type { TradeView } from '../_lib/derive';

const { colors } = theme;

const suratTrackUrl = (code: string) =>
  `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(code)}`;

const carrierLabel = (s: TradeShipment) =>
  (s.carrier === 'surat' ? 'Sürat Kargo' : s.carrier || '—') +
  (s.trackingNumber ? ` · ${s.trackingNumber}` : '');

function CopyBtn({ code, onCopy }: { code?: string | null; onCopy: (c?: string | null) => void }) {
  if (!code) return null;
  return (
    <Pressable onPress={() => onCopy(code)} style={styles.copyBtn} hitSlop={8}>
      <Ionicons name="copy-outline" size={16} color={colors.primary[600]!} />
      <Text variant="caption" tone="primary" weight="medium">Kopyala</Text>
    </Pressable>
  );
}

/** Kargo kartları: legacy takip + depoya-giriş + alıcılara-çıkış + iade. */
export function TradeShippingSection({
  trade,
  view,
  t,
  onCopy,
}: {
  trade: Trade;
  view: TradeView;
  t: TFn;
  onCopy: (code?: string | null) => void;
}) {
  const {
    isInitiator,
    isReceiver,
    myToWarehouseShipment,
    otherToWarehouseShipment,
    myFromWarehouseShipment,
    otherFromWarehouseShipment,
    myReturnShipment,
    myTrackingNumber,
    theirTrackingNumber,
  } = view;

  return (
    <>
      {/* Legacy Kargo Durumu — yalnızca eski (direkt-kargo) takaslarda. */}
      {(myTrackingNumber || theirTrackingNumber) && (
        <Card style={styles.card}>
          <Text variant="label" style={styles.sectionTitle}>Kargo Durumu</Text>
          <View style={styles.shippingRow}>
            <Ionicons
              name={myTrackingNumber ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={myTrackingNumber ? colors.success[600]! : colors.text.muted}
            />
            <Text variant="body" style={styles.shippingText}>
              Sizin kargonuz: {myTrackingNumber || 'Henüz gönderilmedi'}
            </Text>
          </View>
          <View style={styles.shippingRow}>
            <Ionicons
              name={theirTrackingNumber ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={theirTrackingNumber ? colors.success[600]! : colors.text.muted}
            />
            <Text variant="body" style={styles.shippingText}>
              Karşı taraf: {theirTrackingNumber || 'Henüz gönderilmedi'}
            </Text>
          </View>
          {theirTrackingNumber && (
            <Button
              variant="outline"
              title="Kargoyu Takip Et"
              onPress={() => Linking.openURL(suratTrackUrl(theirTrackingNumber))}
              style={styles.trackButton}
            />
          )}
        </Card>
      )}

      {/* Inbound shipment info (Sürat Kargo, auto-issued). */}
      {['shipping_to_warehouse', 'at_warehouse', 'admin_reviewing'].includes(trade.status) &&
        myToWarehouseShipment?.trackingNumber &&
        (isInitiator || isReceiver) && (
          <Card style={{ ...styles.card, ...styles.inboundCard }} testID="trade-inbound-card">
            <View style={styles.shippingRow}>
              <MaterialCommunityIcons name="truck-fast-outline" size={22} color={colors.primary[600]!} />
              <Text variant="label" style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>
                {t('trade.warehouseShipping.title')}
              </Text>
            </View>
            <Text variant="caption" style={styles.protectionDesc}>{t('trade.warehouseShipping.subtitle')}</Text>
            <View style={styles.inboundShipBox}>
              <Text variant="caption" style={styles.messageSender}>{t('trade.warehouseShipping.yourShipment')}</Text>
              <View style={styles.trackingCodeRow}>
                <Text style={[styles.inboundTrackingNumber, { flex: 1 }]} numberOfLines={1}>
                  {myToWarehouseShipment?.trackingNumber ?? '—'}
                </Text>
                <CopyBtn code={myToWarehouseShipment?.trackingNumber} onCopy={onCopy} />
              </View>
              {trade.status === 'shipping_to_warehouse' ? (
                <Text variant="caption" style={styles.inboundShipHint}>{t('trade.warehouseShipping.handIn')}</Text>
              ) : (
                <Text variant="caption" style={styles.inboundShipHint}>Ürününüz Tarodan deposuna ulaştı.</Text>
              )}
              <View style={styles.inboundChipRow}>
                <ShipmentStatusChip testID="trade-status-chip-my-inbound" status={myToWarehouseShipment?.status} t={t} />
              </View>
              {myToWarehouseShipment?.carrier === 'surat' && myToWarehouseShipment?.trackingNumber ? (
                <Button
                  variant="outline"
                  title="Sürat'ta Takip Et"
                  onPress={() => Linking.openURL(suratTrackUrl(myToWarehouseShipment.trackingNumber!))}
                  style={styles.trackButton}
                />
              ) : null}
            </View>
            <Text variant="caption" style={styles.inboundShipHint}>
              {renderOtherShipmentHint(otherToWarehouseShipment?.status, t)}
            </Text>
          </Card>
        )}

      {/* Shipping to recipients — outbound from warehouse. */}
      {trade.status === 'shipping_to_recipients' && (isInitiator || isReceiver) && (
        <Card style={{ ...styles.card, ...styles.inboundCard }} testID="trade-outbound-card">
          <View style={styles.shippingRow}>
            <MaterialCommunityIcons name="truck-delivery-outline" size={22} color={colors.info[600]!} />
            <Text variant="label" style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>Kargonuz Yolda</Text>
          </View>
          {myFromWarehouseShipment ? (
            <View style={styles.inboundShipBox}>
              <Text variant="caption" style={styles.messageSender}>Size gönderilen kargo</Text>
              <View style={styles.trackingCodeRow}>
                <Text style={[styles.inboundTrackingNumber, { flex: 1 }]} numberOfLines={1}>
                  {carrierLabel(myFromWarehouseShipment)}
                </Text>
                <CopyBtn code={myFromWarehouseShipment.trackingNumber} onCopy={onCopy} />
              </View>
              <View style={styles.inboundChipRow}>
                <ShipmentStatusChip testID="trade-status-chip-my-outbound" status={myFromWarehouseShipment.status} t={t} />
              </View>
              {myFromWarehouseShipment.carrier === 'surat' && myFromWarehouseShipment.trackingNumber && (
                <Button
                  variant="outline"
                  title="Sürat'ta Takip Et"
                  onPress={() => Linking.openURL(suratTrackUrl(myFromWarehouseShipment.trackingNumber!))}
                  style={styles.trackButton}
                />
              )}
            </View>
          ) : (
            <View style={styles.inboundShipBox}>
              <Text variant="caption" style={styles.inboundShipHint}>Takip bilgileri kısa süre içinde görünecek.</Text>
            </View>
          )}
          {otherFromWarehouseShipment ? (
            <View style={[styles.inboundShipBox, { marginTop: 8 }]}>
              <Text variant="caption" style={styles.messageSender}>Karşı tarafın kargosu</Text>
              <Text variant="bodySm" numberOfLines={1}>{carrierLabel(otherFromWarehouseShipment)}</Text>
              <View style={styles.inboundChipRow}>
                <ShipmentStatusChip status={otherFromWarehouseShipment.status} t={t} />
              </View>
            </View>
          ) : null}
        </Card>
      )}

      {/* Return shipment tracking. */}
      {trade.status === 'returning' && myReturnShipment && (
        <Card style={{ ...styles.card, ...styles.inboundCard }} testID="trade-return-card">
          <View style={styles.shippingRow}>
            <MaterialCommunityIcons name="truck-fast-outline" size={22} color={colors.warning[600]!} />
            <Text variant="label" style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>İade Kargosu</Text>
          </View>
          <View style={styles.inboundShipBox}>
            <View style={styles.trackingCodeRow}>
              <Text style={[styles.inboundTrackingNumber, { flex: 1 }]} numberOfLines={1}>
                {carrierLabel(myReturnShipment)}
              </Text>
              <CopyBtn code={myReturnShipment.trackingNumber} onCopy={onCopy} />
            </View>
            <View style={styles.inboundChipRow}>
              <ShipmentStatusChip status={myReturnShipment.status} t={t} />
            </View>
            {myReturnShipment.carrier === 'surat' && myReturnShipment.trackingNumber && (
              <Button
                variant="outline"
                title="Sürat'ta Takip Et"
                onPress={() => Linking.openURL(suratTrackUrl(myReturnShipment.trackingNumber!))}
                style={styles.trackButton}
              />
            )}
          </View>
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginTop: 0, backgroundColor: colors.surface.DEFAULT },
  sectionTitle: { marginBottom: 12, color: colors.text.heading },
  shippingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  shippingText: { flex: 1 },
  trackButton: { marginTop: 8 },
  protectionDesc: { color: colors.text.muted, marginTop: 2 },
  messageSender: { color: colors.primary[600]!, fontWeight: '500', marginBottom: 4 },
  inboundCard: { borderWidth: 1, borderColor: colors.border.DEFAULT },
  inboundShipBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.alt,
  },
  inboundTrackingNumber: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
  },
  inboundChipRow: { flexDirection: 'row', marginTop: 8 },
  trackingCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary[50]!,
  },
  inboundShipHint: { color: colors.text.muted, marginTop: 8 },
});
