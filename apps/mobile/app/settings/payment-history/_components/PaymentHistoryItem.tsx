import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import { STATUS_CONFIG, formatDate, formatCurrency } from '../_lib/status';
import type { Payment } from '../_lib/types';

/** Tek ödeme geçmişi satırı — foto/statü ikonu, açıklama/tarih/yöntem, tutar/rozet. */
export function PaymentHistoryItem({ item, onPress }: { item: Payment; onPress: (p: Payment) => void }) {
  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;

  return (
    <TouchableOpacity style={styles.paymentItem} onPress={() => onPress(item)} activeOpacity={0.7}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.productImage} />
      ) : (
        <View style={[styles.statusIconContainer, { backgroundColor: statusCfg.color + '15' }]}>
          <Ionicons name={statusCfg.icon as any} size={24} color={statusCfg.color} />
        </View>
      )}

      <View style={styles.paymentInfo}>
        <Text style={styles.paymentDescription} numberOfLines={1}>{item.description || 'Ödeme'}</Text>
        <Text style={styles.paymentDate}>{formatDate(item.createdAt)}</Text>
        {item.method ? <Text style={styles.paymentMethod}>{item.method}</Text> : null}
      </View>

      <View style={styles.paymentRight}>
        <Text style={styles.paymentAmount}>{formatCurrency(item.amount)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '15' }]}>
          <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
