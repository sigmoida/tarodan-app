import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Button, Card, Portal, Dialog, FAB, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, ScreenLoader, EmptyState, Text, TextInput } from '../../src/components/common';
import { useAuthStore } from '../../src/stores/authStore';

interface PaymentMethod {
  cardToken: string;
  cardAlias?: string;
  cardHolderName?: string;
  lastFourDigits?: string;
  cardBrand?: string;
  binNumber?: string;
  expireMonth?: string;
  expireYear?: string;
  isDefault?: boolean;
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

  const { data, isLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const response = await paymentsApi.getPaymentMethods();
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated,
  });

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
      Alert.alert('Başarılı', 'Kart başarıyla kaydedildi.');
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Kart kaydedilemedi.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (cardToken: string) => paymentsApi.deletePaymentMethod(cardToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
    onError: () => Alert.alert('Hata', 'Kart silinemedi.'),
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
    if (!form.cardHolderName.trim()) return Alert.alert('Eksik bilgi', 'Kart sahibi gerekli.');
    const cleanNumber = form.cardNumber.replace(/\s/g, '');
    if (cleanNumber.length < 15 || cleanNumber.length > 19)
      return Alert.alert('Eksik bilgi', 'Geçerli bir kart numarası girin.');
    if (!/^\d{1,2}$/.test(form.expireMonth) || parseInt(form.expireMonth, 10) < 1 || parseInt(form.expireMonth, 10) > 12)
      return Alert.alert('Eksik bilgi', 'Geçerli ay (1-12) girin.');
    if (!/^\d{2,4}$/.test(form.expireYear))
      return Alert.alert('Eksik bilgi', 'Geçerli yıl girin.');
    if (!/^\d{3,4}$/.test(form.cvc))
      return Alert.alert('Eksik bilgi', 'Geçerli CVC girin.');
    addMutation.mutate();
  };

  const handleDelete = (m: PaymentMethod) => {
    Alert.alert('Kartı Sil', 'Bu kartı silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(m.cardToken),
      },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Ödeme Yöntemleri" />
        <EmptyState
          fullscreen
          icon="card-outline"
          title="Kaydedilmiş kartları görmek için giriş yapın"
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
        <ScrollView contentContainerStyle={styles.list}>
          {methods.map(m => (
            <Card key={m.cardToken} style={styles.cardItem}>
              <Card.Content style={styles.cardContent}>
                <View style={styles.cardIconWrap}>
                  <MaterialCommunityIcons
                    name={brandIcon(m.cardBrand)}
                    size={28}
                    color={TarodanColors.primary}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardAlias}>{m.cardAlias || 'Kart'}</Text>
                  <Text style={styles.cardNumber}>
                    {m.cardBrand ? `${m.cardBrand} ` : ''}•••• {m.lastFourDigits || '****'}
                  </Text>
                  {m.expireMonth && m.expireYear ? (
                    <Text style={styles.cardExpiry}>
                      Son Kullanım: {m.expireMonth}/{m.expireYear}
                    </Text>
                  ) : null}
                  {m.cardHolderName ? (
                    <Text style={styles.cardHolder}>{m.cardHolderName}</Text>
                  ) : null}
                </View>
                <IconButton
                  icon="delete-outline"
                  iconColor={TarodanColors.error}
                  onPress={() => handleDelete(m)}
                />
              </Card.Content>
            </Card>
          ))}

          <View style={styles.secNote}>
            <Ionicons name="lock-closed" size={14} color={TarodanColors.success} />
            <Text style={styles.secNoteText}>
              Kart bilgileriniz PCI-DSS uyumlu ödeme sağlayıcıda saklanır; Tarodan'da tam kart numarası bulunmaz.
            </Text>
          </View>
        </ScrollView>
      )}

      {methods.length > 0 ? (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => setDialogOpen(true)}
          color="#fff"
        />
      ) : null}

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>Yeni Kart</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <TextInput
                mode="outlined"
                label="Kart Takma Adı (ör. 'İş Kartım')"
                value={form.cardAlias}
                onChangeText={(v: string) => setForm(f => ({ ...f,cardAlias: v }))}
                style={styles.input}
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />
              <TextInput
                mode="outlined"
                label="Kart Sahibi"
                value={form.cardHolderName}
                onChangeText={(v: string) => setForm(f => ({ ...f,cardHolderName: v }))}
                style={styles.input}
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />
              <TextInput
                mode="outlined"
                label="Kart Numarası"
                value={form.cardNumber}
                onChangeText={(v: string) => setForm(f => ({ ...f,cardNumber: v.replace(/[^\d\s]/g, '') }))}
                keyboardType="number-pad"
                maxLength={19}
                style={styles.input}
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />
              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  label="Ay"
                  placeholder="MM"
                  value={form.expireMonth}
                  onChangeText={(v: string) => setForm(f => ({ ...f,expireMonth: v.replace(/[^\d]/g, '') }))}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={[styles.input, styles.rowItem]}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="Yıl"
                  placeholder="YY"
                  value={form.expireYear}
                  onChangeText={(v: string) => setForm(f => ({ ...f,expireYear: v.replace(/[^\d]/g, '') }))}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={[styles.input, styles.rowItem]}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="CVC"
                  value={form.cvc}
                  onChangeText={(v: string) => setForm(f => ({ ...f,cvc: v.replace(/[^\d]/g, '') }))}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  style={[styles.input, styles.rowItem]}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)}>Vazgeç</Button>
            <Button
              mode="contained"
              buttonColor={TarodanColors.primary}
              onPress={handleAdd}
              loading={addMutation.isPending}
              disabled={addMutation.isPending}
            >
              Kaydet
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  cardItem: {
    backgroundColor: TarodanColors.background,
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
    backgroundColor: TarodanColors.primaryLight,
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
    color: TarodanColors.textPrimary,
  },
  cardNumber: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    letterSpacing: 1,
  },
  cardExpiry: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
  },
  cardHolder: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
  },
  secNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: TarodanColors.successLight,
    borderRadius: 10,
    marginTop: 8,
  },
  secNoteText: {
    flex: 1,
    fontSize: 12,
    color: TarodanColors.success,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: TarodanColors.primary,
  },
  dialogScroll: {
    paddingHorizontal: 0,
  },
  input: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
  },
  rowItem: {
    flex: 1,
    marginHorizontal: 0,
  },
});
