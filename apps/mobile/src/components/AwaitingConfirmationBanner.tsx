import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Button, Card, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Faz 4C.2 — Mobile 48h pencere banner'ı.
 * awaiting_buyer_confirmation durumunda gösterilir.
 */
export interface AwaitingConfirmationBannerProps {
  confirmationDeadline: string;
  onConfirm: () => void;
  onReportProblem: () => void;
  confirming?: boolean;
}

function calcRemaining(deadlineISO: string): {
  text: string;
  level: 'green' | 'yellow' | 'red' | 'expired';
  hoursLeft: number;
} {
  const deadline = new Date(deadlineISO).getTime();
  const now = Date.now();
  const diff = deadline - now;

  if (diff <= 0) {
    return { text: 'Süre doldu', level: 'expired', hoursLeft: 0 };
  }

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const text = `${hours} saat ${minutes} dakika kaldı`;

  let level: 'green' | 'yellow' | 'red' = 'green';
  if (hours < 6) level = 'red';
  else if (hours < 12) level = 'yellow';

  return { text, level, hoursLeft: hours };
}

const { colors, spacing, radius } = theme;

const levelStyles = {
  green: { bg: colors.success[50], border: colors.success[300], text: colors.success[900] },
  yellow: { bg: colors.warning[50], border: colors.warning[400], text: colors.warning[900] },
  red: { bg: colors.danger[50], border: colors.danger[400], text: colors.danger[900] },
  expired: { bg: colors.gray[100], border: colors.gray[300], text: colors.gray[700] },
} as const;

export function AwaitingConfirmationBanner({
  confirmationDeadline,
  onConfirm,
  onReportProblem,
  confirming,
}: AwaitingConfirmationBannerProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000); // 30s tick
    return () => clearInterval(interval);
  }, []);

  void tick;
  const remaining = calcRemaining(confirmationDeadline);
  const styleSet = levelStyles[remaining.level];

  return (
    <Card style={[styles.card, { backgroundColor: styleSet.bg, borderColor: styleSet.border }]}>
      <View style={styles.headerRow}>
        <Ionicons name="time-outline" size={24} color={styleSet.text} />
        <Text variant="body" style={{ color: styleSet.text, fontWeight: '600' }}>
          48 Saat Kontrol Süreci
        </Text>
      </View>

      <Text variant="h3" style={{ color: styleSet.text, marginTop: spacing[2] }}>
        {remaining.text}
      </Text>

      <Text variant="caption" style={{ color: styleSet.text, marginTop: spacing[1] }}>
        Ürünü kontrol et. Sorun yoksa hemen onayla; sorun varsa bildir.
        48 saat sonunda otomatik tamamlanır.
      </Text>

      <View style={styles.actionRow}>
        <Button
          variant="primary"
          title={confirming ? 'Onaylanıyor...' : 'Sorun yok, onaylıyorum'}
          onPress={onConfirm}
          disabled={confirming}
          style={{ flex: 1 }}
        />
      </View>

      <Pressable onPress={onReportProblem} style={styles.reportLink}>
        <Text variant="body" style={{ color: colors.danger[700], textDecorationLine: 'underline' }}>
          Sorun bildir
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  reportLink: {
    alignSelf: 'center',
    marginTop: spacing[2],
    padding: spacing[2],
  },
});
