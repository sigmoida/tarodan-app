import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ordersApi } from '../../services/api';
import { TarodanColors } from '../../theme';
import { formatPrice } from '../../utils/format';
import { Text } from './PaperCompat';

interface CommissionPreviewProps {
  /** Kullanıcının girdiği fiyat (TL, string veya sayı). */
  amount: string | number;
  /** Kategori id'si (komisyon oranı kategoriye göre değişir). */
  categoryId?: string | null;
  /** Debounce süresi (ms). Varsayılan 500. */
  debounceMs?: number;
}

interface CommissionData {
  amount?: number;
  commission?: number;
  commissionRate?: number;
  netAmount?: number;
  netEarning?: number;
}

/**
 * Web paritesi: İlan formunda fiyat girildikçe komisyon ve net kazancı gösterir.
 * Fiyat değiştikçe debounce ile `ordersApi.getCommissionPreview` çağırır.
 */
export function CommissionPreview({ amount, categoryId, debounceMs = 500 }: CommissionPreviewProps) {
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount || '0');
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!numeric || numeric <= 0) {
      setData(null);
      setError(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError(false);
        const response = await ordersApi.getCommissionPreview({
          amount: numeric,
          categoryId: categoryId || undefined,
        });
        if (!cancelled) {
          const payload = (response.data as any)?.data ?? response.data ?? null;
          setData(payload);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [numeric, categoryId, debounceMs]);

  if (!numeric || numeric <= 0) return null;

  if (loading && !data) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={TarodanColors.primary} />
        <Text style={styles.loadingText}>Komisyon hesaplanıyor...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Ionicons name="information-circle-outline" size={16} color={TarodanColors.textTertiary} />
        <Text style={styles.errorText}>Komisyon önizlemesi şu an görüntülenemiyor.</Text>
      </View>
    );
  }

  if (!data) return null;

  const commission = Number(data.commission ?? 0);
  const net = Number(data.netAmount ?? data.netEarning ?? numeric - commission);
  const rate = data.commissionRate ? Math.round(Number(data.commissionRate) * 100) : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="calculator-outline" size={16} color={TarodanColors.primary} />
        <Text style={styles.headerText}>
          Fiyat: {formatPrice(numeric)}
          {rate !== null ? ` • Komisyon oranı: %${rate}` : ''}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Platform komisyonu</Text>
        <Text style={[styles.value, { color: TarodanColors.error }]}>
          - {formatPrice(commission)}
        </Text>
      </View>
      <View style={[styles.row, styles.netRow]}>
        <Text style={styles.netLabel}>Net kazancınız</Text>
        <Text style={styles.netValue}>{formatPrice(net)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TarodanColors.primaryLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: TarodanColors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  label: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
  },
  netRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: TarodanColors.primary + '40',
  },
  netLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  netValue: {
    fontSize: 16,
    fontWeight: '800',
    color: TarodanColors.primary,
  },
  loadingText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 8,
  },
  errorText: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginLeft: 6,
    flex: 1,
  },
});

export default CommissionPreview;
