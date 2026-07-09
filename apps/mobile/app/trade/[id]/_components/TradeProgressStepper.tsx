import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { STEP_FLOW_STATUSES, STATUS_TO_STEP_KEY } from '../_lib/status';

const { colors } = theme;

/** Depo-escrow akışı için yatay ilerleme çubuğu (web ile parite). */
export function TradeProgressStepper({ status, hasCash }: { status: string; hasCash: boolean }) {
  if (!STEP_FLOW_STATUSES.has(status)) return null;
  const steps = [
    { key: 'accepted', label: 'Kabul Edildi' },
    ...(hasCash ? [{ key: 'awaiting_payment', label: 'Ödeme' }] : []),
    { key: 'shipping_to_warehouse', label: 'Depoya Kargo' },
    { key: 'at_warehouse', label: 'Depoda' },
    { key: 'shipping_to_recipients', label: 'Size Kargo' },
    { key: 'completed', label: 'Tamamlandı' },
  ];
  const currentKey = STATUS_TO_STEP_KEY[status] ?? 'accepted';
  const current = Math.max(0, steps.findIndex((s) => s.key === currentKey));
  const isCompleted = status === 'completed';

  return (
    <View style={styles.stepperRow}>
      {steps.map((step, i) => {
        const done = i < current || isCompleted;
        const active = i === current && !isCompleted;
        const reached = i <= current;
        return (
          <View key={step.key} style={styles.stepCol}>
            <View style={styles.stepLineRow}>
              <View
                style={[
                  styles.stepLine,
                  {
                    backgroundColor: reached && i > 0 ? colors.primary[500]! : colors.border.DEFAULT,
                    opacity: i === 0 ? 0 : 1,
                  },
                ]}
              />
              <View style={[styles.stepCircle, done ? styles.stepDone : active ? styles.stepActive : styles.stepFuture]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.white} />
                ) : (
                  <Text style={[styles.stepNum, { color: active ? colors.white : colors.text.muted }]}>{i + 1}</Text>
                )}
              </View>
              <View
                style={[
                  styles.stepLine,
                  {
                    backgroundColor: done ? colors.primary[500]! : colors.border.DEFAULT,
                    opacity: i === steps.length - 1 ? 0 : 1,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.stepLabel,
                {
                  color: active ? colors.primary[700]! : done ? colors.text.body : colors.text.muted,
                  fontWeight: active ? '700' : '400',
                },
              ]}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stepperRow: { flexDirection: 'row' },
  stepCol: { flex: 1, alignItems: 'center' },
  stepLineRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  stepLine: { flex: 1, height: 2 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: colors.primary[500]! },
  stepActive: { backgroundColor: colors.primary[600]!, borderWidth: 3, borderColor: colors.primary[100]! },
  stepFuture: { backgroundColor: colors.surface.alt, borderWidth: 1, borderColor: colors.border.DEFAULT },
  stepNum: { fontSize: 12, fontWeight: '600' },
  stepLabel: { fontSize: 10, textAlign: 'center', marginTop: 6, lineHeight: 13 },
});
