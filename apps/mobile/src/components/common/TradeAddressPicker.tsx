import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { theme, Text } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { addressesApi } from '../../services/api';

const { colors } = theme;

interface Address {
  id: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  isDefault?: boolean;
}

interface Props {
  /** Seçili adres id'si değişince çağrılır (null = seçim yok). */
  onChange: (addressId: string | null) => void;
  label?: string;
}

/**
 * Takas akışında teslimat adresi seçtiren mobil bileşen:
 *   - Kayıtlı adresleri seçilebilir kart listesinde gösterir (varsayılan ön-seçili).
 *   - "Yeni adres ekle" → Adreslerim ekranına götürür; geri dönünce focus'ta tazeler.
 */
export function TradeAddressPicker({ onChange, label }: Props) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      onChange(id);
    },
    [onChange],
  );

  const load = useCallback(async () => {
    try {
      const res = await addressesApi.getAll();
      const list: Address[] = (res.data as any)?.addresses || (res.data as any) || [];
      setAddresses(list);
      // Seçim yoksa veya seçili adres listede yoksa varsayılanı seç.
      setSelectedId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        const def = list.find((a) => a.isDefault) || list[0];
        const next = def?.id ?? null;
        onChange(next);
        return next;
      });
    } catch {
      setAddresses([]);
      select(null);
    } finally {
      setLoading(false);
    }
  }, [onChange, select]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      {label ? (
        <View style={styles.labelRow}>
          <Ionicons name="location-outline" size={16} color={colors.primary[600]!} />
          <Text style={styles.label}>{label}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary[600]!} style={{ marginVertical: 16 }} />
      ) : (
        <>
          {addresses.map((a) => {
            const active = selectedId === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.card, active && styles.cardActive]}
                onPress={() => select(a.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={active ? colors.primary[600]! : colors.text.muted}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {a.fullName}
                    {a.isDefault ? <Text style={styles.default}>  (Varsayılan)</Text> : null}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {a.district}/{a.city} · {a.phone}
                  </Text>
                  <Text style={styles.addr} numberOfLines={1}>
                    {a.address}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {addresses.length === 0 ? (
            <Text style={styles.empty}>Kayıtlı adresiniz yok. Lütfen bir adres ekleyin.</Text>
          ) : null}

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/settings/addresses' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color={colors.primary[600]!} />
            <Text style={styles.addBtnText}>Yeni adres ekle</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text.heading },
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  cardActive: { borderColor: colors.primary[500]!, backgroundColor: colors.primary[50]! },
  name: { fontSize: 14, fontWeight: '600', color: colors.text.heading },
  default: { fontSize: 12, color: colors.primary[600]!, fontWeight: '500' },
  sub: { fontSize: 13, color: colors.text.muted, marginTop: 2 },
  addr: { fontSize: 12, color: colors.text.subtle, marginTop: 1 },
  empty: { fontSize: 13, color: colors.text.muted, paddingVertical: 8 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary[50]!,
  },
  addBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary[600]! },
});
