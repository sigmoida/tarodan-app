import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Button,
  Card,
  Input,
  Text,
  Snackbar,
  appAlert,
  theme,
} from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankAccountApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { isValidTrIban, normalizeIban, formatIbanDisplay } from '@/utils/iban';
import { ScreenHeader } from '@/components/common';

const { colors } = theme;

const bankAccountSchema = z.object({
  accountHolder: z.string().min(2, 'Hesap sahibi adı en az 2 karakter olmalı').max(150),
  iban: z.string().refine((v) => isValidTrIban(v), 'Geçerli bir TR IBAN giriniz (TR + 24 rakam)'),
  tcKimlikNo: z
    .string()
    .regex(/^\d{11}$/, 'TC Kimlik No 11 rakam olmalı')
    .optional()
    .or(z.literal('')),
  taxId: z.string().max(20).optional().or(z.literal('')),
});

type BankAccountForm = {
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string;
  taxId?: string;
};

export default function BankAccountScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant?: 'default' | 'success' | 'danger';
  }>({ visible: false, message: '' });

  const accountQuery = useQuery({
    queryKey: ['bank-account'],
    queryFn: async () => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled: isAuthenticated,
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BankAccountForm>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: { accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' },
  });

  useEffect(() => {
    const acc = accountQuery.data;
    if (acc) {
      reset({
        accountHolder: acc.accountHolder || '',
        iban: formatIbanDisplay(acc.iban || ''),
        tcKimlikNo: acc.tcKimlikNo || '',
        taxId: acc.taxId || '',
      });
    }
  }, [accountQuery.data, reset]);

  const upsertMutation = useMutation({
    mutationFn: async (data: BankAccountForm) =>
      bankAccountApi.upsert({
        accountHolder: data.accountHolder.trim(),
        iban: normalizeIban(data.iban),
        ...(data.tcKimlikNo ? { tcKimlikNo: data.tcKimlikNo } : {}),
        ...(data.taxId ? { taxId: data.taxId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-account'] });
      setSnackbar({ visible: true, message: 'Banka hesabı kaydedildi', variant: 'success' });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Kaydetme başarısız';
      setSnackbar({
        visible: true,
        message: Array.isArray(msg) ? msg[0] : msg,
        variant: 'danger',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => bankAccountApi.remove(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-account'] });
      reset({ accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' });
      setSnackbar({ visible: true, message: 'Banka hesabı silindi', variant: 'success' });
    },
    onError: (error: any) => {
      setSnackbar({
        visible: true,
        message: error.response?.data?.message || 'Silme başarısız',
        variant: 'danger',
      });
    },
  });

  const onSubmit = (data: BankAccountForm) => upsertMutation.mutate(data);

  const handleDelete = () =>
    appAlert('Banka Hesabını Sil', 'Silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);

  const existing = !!accountQuery.data;

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <Text variant="h3">Giriş Yapın</Text>
        <Button
          variant="primary"
          title="Giriş Yap"
          onPress={() => router.push('/(auth)/login')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Banka Hesabı / IBAN" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text variant="bodySm" style={styles.hint}>
            Satışlarınızdan elde ettiğiniz tutar bu IBAN'a aktarılır.
          </Text>

          <Controller
            control={control}
            name="accountHolder"
            render={({ field: { onChange, value } }) => (
              <Input
                testID="bank-account-holder-input"
                label="Hesap Sahibi *"
                value={value}
                onChangeText={onChange}
                error={errors.accountHolder?.message}
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="iban"
            render={({ field: { onChange, value } }) => (
              <Input
                testID="bank-account-iban-input"
                label="IBAN *"
                value={value}
                onChangeText={(t) => onChange(formatIbanDisplay(normalizeIban(t).slice(0, 26)))}
                error={errors.iban?.message}
                placeholder="TR.. .... .... ...."
                autoCapitalize="characters"
                maxLength={32}
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="tcKimlikNo"
            render={({ field: { onChange, value } }) => (
              <Input
                label="TC Kimlik No (opsiyonel)"
                value={value ?? ''}
                onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 11))}
                error={errors.tcKimlikNo?.message}
                keyboardType="number-pad"
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="taxId"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Vergi No (opsiyonel)"
                value={value ?? ''}
                onChangeText={(t) => onChange(t.slice(0, 20))}
                error={errors.taxId?.message}
                containerStyle={styles.input}
              />
            )}
          />

          {existing && (
            <Text variant="bodySm" style={styles.updateWarning}>
              Bilgileri güncellerseniz hesabınız yeniden doğrulanana kadar "Doğrulanmadı" durumuna
              döner.
            </Text>
          )}

          <Button
            testID="bank-account-submit-button"
            variant="primary"
            fullWidth
            title={existing ? 'Güncelle' : 'Kaydet'}
            onPress={handleSubmit(onSubmit)}
            isLoading={upsertMutation.isPending}
            disabled={upsertMutation.isPending}
            style={styles.submitButton}
          />

          {existing && (
            <Button
              testID="bank-account-delete-button"
              variant="ghost"
              fullWidth
              title="Banka Hesabını Sil"
              onPress={handleDelete}
              style={styles.deleteButton}
            />
          )}
        </Card>

        <View style={{ height: 50 }} />
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={3000}
        variant={snackbar.variant ?? 'default'}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing[4],
  },
  card: {
    marginTop: theme.spacing[4],
    padding: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  hint: {
    color: colors.text.muted,
    marginBottom: theme.spacing[3],
  },
  input: {
    marginBottom: theme.spacing[3],
  },
  updateWarning: {
    color: colors.text.muted,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  submitButton: {
    marginTop: theme.spacing[4],
  },
  deleteButton: {
    marginTop: theme.spacing[2],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[4],
  },
});
