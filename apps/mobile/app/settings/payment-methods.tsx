import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Button,
  Card,
  Modal,
  FAB,
  IconButton,
  Input,
  Text,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../../src/services/api';
import { ScreenHeader, ScreenLoader, EmptyState, ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import { useAuthStore } from '../../src/stores/authStore';

const { colors } = theme;

interface PaymentMethod {
  id: string;
  cardBrand?: string;
  lastFour?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault?: boolean;
  createdAt?: string;
}

function brandIcon(brand?: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  const lower = (brand || '').toLowerCase();
  if (lower.includes('visa')) return 'credit-card';
  if (lower.includes('master')) return 'credit-card';
  if (lower.includes('amex') || lower.includes('american')) return 'credit-card';
  return 'credit-card-outline';
}

export default function PaymentMethodsScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    cardHolderName: '',
    cardNumber: '',
    expireMonth: '',
    expireYear: '',
    cvc: '',
    cardAlias: '',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const response = await paymentsApi.getPaymentMethods();
      const payload = response.data?.methods ?? response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  const methods: PaymentMethod[] = data ?? [];

  const addMutation = useMutation({
    mutationFn: () =>
      paymentsApi.addPaymentMethod({
        card: {
          cardHolderName: form.cardHolderName.trim(),
          cardNumber: form.cardNumber.replace(/\s/g, ''),
          expireMonth: form.expireMonth.trim(),
          expireYear: form.expireYear.trim(),
          cvc: form.cvc.trim(),
          cardAlias: form.cardAlias.trim() || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      resetForm();
      setDialogOpen(false);
      appAlert('Başarılı', 'Kart başarıyla kaydedildi.');
    },
    onError: (e: any) =>
      appAlert('Hata', e?.response?.data?.message || 'Kart kaydedilemedi.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.deletePaymentMethod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
    onError: () => appAlert('Hata', 'Kart silinemedi.'),
  });

  const resetForm = () =>
    setForm({
      cardHolderName: '',
      cardNumber: '',
      expireMonth: '',
      expireYear: '',
      cvc: '',
      cardAlias: '',
    });

  const handleAdd = () => {
    if (!form.cardHolderName.trim()) return appAlert('Eksik bilgi', 'Kart sahibi gerekli.');
    const cleanNumber = form.cardNumber.replace(/\s/g, '');
    if (cleanNumber.length < 15 || cleanNumber.length > 19)
      return appAlert('Eksik bilgi', 'Geçerli bir kart numarası girin.');
    if (!/^\d{1,2}$/.test(form.expireMonth) || parseInt(form.expireMonth, 10) < 1 || parseInt(form.expireMonth, 10) > 12)
      return appAlert('Eksik bilgi', 'Geçerli ay (1-12) girin.');
    if (!/^\d{2,4}$/.test(form.expireYear))
      return appAlert('Eksik bilgi', 'Geçerli yıl girin.');
    if (!/^\d{3,4}$/.test(form.cvc))
      return appAlert('Eksik bilgi', 'Geçerli CVC girin.');
    addMutation.mutate();
  };

  const handleDelete = (m: PaymentMethod) => {
    appAlert('Kartı Sil', 'Bu kartı silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(m.id),
      },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ödeme Yöntemleri" />
        <EmptyState
          fullscreen
          icon="card-outline"
          title="Kaydedilmiş kartları görmek için giriş yapın"
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ödeme Yöntemleri" />

      {isLoading ? (
        <ScreenLoader />
      ) : methods.length === 0 ? (
        <EmptyState
          fullscreen
          icon="card-outline"
          title="Kayıtlı kart yok"
          subtitle="Kayıtlı bir kart eklerseniz sonraki ödemelerinizde hızlıca kullanabilirsiniz."
          actionLabel="Kart Ekle"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {methods.map(m => (
            <Card key={m.id} style={styles.cardItem}>
              <View style={styles.cardContent}>
                <View style={styles.cardIconWrap}>
                  <MaterialCommunityIcons
                    name={brandIcon(m.cardBrand)}
                    size={28}
                    color={colors.primary[600]!}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardAlias}>{m.cardBrand || 'Kart'}</Text>
                  <Text style={styles.cardNumber}>
                    {m.cardBrand ? `${m.cardBrand} ` : ''}•••• {m.lastFour || '****'}
                  </Text>
                  {m.expiryMonth && m.expiryYear ? (
                    <Text style={styles.cardExpiry}>
                      Son Kullanım: {String(m.expiryMonth).padStart(2, '0')}/{m.expiryYear}
                    </Text>
                  ) : null}
                </View>
                <IconButton
                  icon="trash-outline"
                  variant="danger"
                  accessibilityLabel="Kartı sil"
                  onPress={() => handleDelete(m)}
                />
              </View>
            </Card>
          ))}

          <View style={styles.secNote}>
            <Ionicons name="lock-closed" size={14} color={colors.success[600]!} />
            <Text style={styles.secNoteText}>
              Kart bilgileriniz PCI-DSS uyumlu ödeme sağlayıcıda saklanır; Tarodan'da tam kart numarası bulunmaz.
            </Text>
          </View>
        </ScrollView>
      )}

      {methods.length > 0 ? (
        <FAB
          icon="add"
          accessibilityLabel="Yeni kart ekle"
          style={styles.fab}
          onPress={() => setDialogOpen(true)}
        />
      ) : null}

      <Modal isOpen={dialogOpen} onClose={() => setDialogOpen(false)} title="Yeni Kart">
        <ScrollView>
          <Input
            label="Kart Takma Adı (ör. 'İş Kartım')"
            value={form.cardAlias}
            onChangeText={(v: string) => setForm(f => ({ ...f, cardAlias: v }))}
            containerStyle={styles.input}
          />
          <Input
            label="Kart Sahibi"
            value={form.cardHolderName}
            onChangeText={(v: string) => setForm(f => ({ ...f, cardHolderName: v }))}
            containerStyle={styles.input}
          />
          <Input
            label="Kart Numarası"
            value={form.cardNumber}
            onChangeText={(v: string) => setForm(f => ({ ...f, cardNumber: v.replace(/[^\d\s]/g, '') }))}
            keyboardType="number-pad"
            maxLength={19}
            containerStyle={styles.input}
          />
          <View style={styles.row}>
            <Input
              label="Ay"
              placeholder="MM"
              value={form.expireMonth}
              onChangeText={(v: string) => setForm(f => ({ ...f, expireMonth: v.replace(/[^\d]/g, '') }))}
              keyboardType="number-pad"
              maxLength={2}
              containerStyle={styles.rowItem}
            />
            <Input
              label="Yıl"
              placeholder="YY"
              value={form.expireYear}
              onChangeText={(v: string) => setForm(f => ({ ...f, expireYear: v.replace(/[^\d]/g, '') }))}
              keyboardType="number-pad"
              maxLength={4}
              containerStyle={styles.rowItem}
            />
            <Input
              label="CVC"
              value={form.cvc}
              onChangeText={(v: string) => setForm(f => ({ ...f, cvc: v.replace(/[^\d]/g, '') }))}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              containerStyle={styles.rowItem}
            />
          </View>
          <View style={styles.dialogActions}>
            <Button variant="ghost" title="Vazgeç" onPress={() => setDialogOpen(false)} />
            <Button
              variant="primary"
              title="Kaydet"
              onPress={handleAdd}
              isLoading={addMutation.isPending}
              disabled={addMutation.isPending}
            />
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  cardItem: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardAlias: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.heading,
  },
  cardNumber: {
    fontSize: 13,
    color: colors.text.muted,
    letterSpacing: 1,
  },
  cardExpiry: {
    fontSize: 12,
    color: colors.text.subtle,
  },
  cardHolder: {
    fontSize: 12,
    color: colors.text.subtle,
  },
  secNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.success[50]!,
    borderRadius: 10,
    marginTop: 8,
  },
  secNoteText: {
    flex: 1,
    fontSize: 12,
    color: colors.success[600]!,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  input: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  rowItem: {
    flex: 1,
    marginBottom: 12,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
});
