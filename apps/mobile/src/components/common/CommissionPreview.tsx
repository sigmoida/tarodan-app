import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ordersApi } from '../../services/api';
import { theme, Spinner, Text } from '@tarodan/ui-native';
import { formatPrice } from '../../utils/format';

const { colors } = theme;

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
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Komisyon hesaplanıyor...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Ionicons name="information-circle-outline" size={16} color={colors.text.subtle} />
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
        <Ionicons name="calculator-outline" size={16} color={colors.primary[600]!} />
        <Text style={styles.headerText}>
          Fiyat: {formatPrice(numeric)}
          {rate !== null ? ` • Komisyon oranı: %${rate}` : ''}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Platform komisyonu</Text>
        <Text style={[styles.value, { color: colors.danger[600]! }]}>
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
    backgroundColor: colors.primary[50]!,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[3],
    marginTop: theme.spacing[2],
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[600]!,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[2],
  },
  headerText: {
    fontSize: 12,
    color: colors.text.muted,
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
    color: colors.text.muted,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
  },
  netRow: {
    marginTop: theme.spacing[1.5],
    paddingTop: theme.spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.primary[200]!,
  },
  netLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
  netValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary[600]!,
  },
  loadingText: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: theme.spacing[2],
  },
  errorText: {
    fontSize: 12,
    color: colors.text.subtle,
    marginLeft: theme.spacing[1.5],
    flex: 1,
  },
});

export default CommissionPreview;
