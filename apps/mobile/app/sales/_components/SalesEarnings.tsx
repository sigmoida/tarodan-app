import { View } from 'react-native';
import { Card, Text } from '@tarodan/ui-native';
import { styles } from '../_lib/styles';
import { formatPrice } from '../_lib/status';

/** Filtreden bağımsız kazanç özeti (tamamlanan + bekleyen). */
export function SalesEarnings({
  totalEarnings,
  pendingEarnings,
}: {
  totalEarnings: number;
  pendingEarnings: number;
}) {
  return (
    <Card variant="elevated" style={styles.earningsCard}>
      <View style={styles.earningsContent}>
        <View style={styles.earningItem}>
          <Text variant="caption" style={styles.earningLabel}>Tamamlanan</Text>
          <Text variant="h3" style={styles.earningValue}>{formatPrice(totalEarnings)}</Text>
        </View>
        <View style={styles.earningDivider} />
        <View style={styles.earningItem}>
          <Text variant="caption" style={styles.earningLabel}>Bekleyen</Text>
          <Text variant="h3" style={styles.earningValuePending}>{formatPrice(pendingEarnings)}</Text>
        </View>
      </View>
    </Card>
  );
}
