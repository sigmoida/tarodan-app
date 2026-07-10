import React from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, Divider, Text, Input, Textarea, theme } from '@tarodan/ui-native';

import { ThemedRefreshControl } from '@/components/common';
import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';
import { TradeProductPicker } from './TradeProductPicker';
import type { TradeCounterController } from '../_hooks/useTradeCounter';

const { colors } = theme;

/** Notice, product pickers, cash, message, summary, and submit/cancel buttons. */
export function TradeCounterBody({ f }: { f: TradeCounterController }) {
  const { trade } = f;
  if (!trade) return null;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollBody}
      refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
    >
      <View style={styles.noticeCard}>
        <Ionicons name="information-circle" size={18} color={colors.info[600]!} />
        <Text style={styles.noticeText}>
          Orijinal teklifi düzenleyip karşı tarafa yeni bir teklif gönderirsiniz. Nakit fark ekleyebilir, ürün ekleyip çıkartabilirsiniz.
        </Text>
      </View>

      <TradeProductPicker
        title="Vereceğim Ürünler"
        subtitle="Takasta vermek istediğim ürünleri seçin."
        products={f.myProducts}
        selected={f.selectedMine}
        toggle={f.toggleMine}
      />

      <View style={styles.swapWrap}>
        <View style={styles.swapCircle}>
          <Ionicons name="swap-vertical" size={20} color={colors.primary[600]!} />
        </View>
      </View>

      <TradeProductPicker
        title="İsteyeceğim Ürünler"
        subtitle={`${f.amIInitiator ? trade.receiverName : trade.initiatorName} adlı satıcıdan istediğim ürünleri seçin.`}
        products={f.theirProducts}
        selected={f.selectedTheirs}
        toggle={f.toggleTheirs}
      />

      <Card style={styles.card}>
        <Text style={styles.section}>Nakit Fark</Text>
        <View style={styles.chipsRow}>
          <Chip
            label="Ben ödeyeceğim"
            selected={f.cashDirection === 'offer'}
            onPress={() => f.setCashDirection('offer')}
            variant="primary"
            style={styles.chip}
          />
          <Chip
            label="Karşı taraf ödesin"
            selected={f.cashDirection === 'request'}
            onPress={() => f.setCashDirection('request')}
            variant="primary"
            style={styles.chip}
          />
        </View>
        <Input
          label="Tutar (TL)"
          value={f.cashAmount}
          onChangeText={(v: string) => f.setCashAmount(v.replace(/[^\d.]/g, ''))}
          keyboardType="numeric"
          containerStyle={styles.cashInput}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>Mesaj (opsiyonel)</Text>
        <Textarea
          value={f.message}
          onChangeText={(v: string) => f.setMessage(v.slice(0, 500))}
          rows={3}
          placeholder="Karşı tarafa not bırakın..."
          containerStyle={styles.messageInput}
        />
        <Text style={styles.charCount}>{f.message.length}/500</Text>
      </Card>

      {/* Summary */}
      <Card style={styles.card}>
        <Text style={styles.section}>Özet</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Verdiğim Toplam</Text>
          <Text style={styles.summaryValue}>{formatPrice(f.myTotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>İstediğim Toplam</Text>
          <Text style={styles.summaryValue}>{formatPrice(f.theirTotal)}</Text>
        </View>
        {f.cashValue > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {f.cashDirection === 'offer' ? 'Ödeyeceğim' : 'Alacağım'} nakit
            </Text>
            <Text style={[styles.summaryValue, { color: colors.primary[600]! }]}>
              {formatPrice(f.cashValue)}
            </Text>
          </View>
        ) : null}
        <Divider style={{ marginVertical: 8 }} />
        <Text style={styles.summaryHint}>
          {f.selectedMine.length} ürün vereceksiniz, {f.selectedTheirs.length} ürün alacaksınız.
        </Text>
      </Card>

      <Button
        variant="primary"
        title="Karşı Teklifi Gönder"
        onPress={f.handleSubmit}
        isLoading={f.counterMutation.isPending}
        disabled={f.counterMutation.isPending || (f.selectedMine.length === 0 && f.selectedTheirs.length === 0)}
        style={styles.submitBtn}
      />

      <Button variant="ghost" title="Vazgeç" onPress={() => router.back()} />
    </ScrollView>
  );
}
