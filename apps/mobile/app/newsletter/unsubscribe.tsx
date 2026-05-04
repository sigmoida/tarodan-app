import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { guestApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, Text, TextInput } from '../../src/components/common';

export default function NewsletterUnsubscribeScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);

  const unsubscribeMutation = useMutation({
    mutationFn: async (data: { email?: string; token?: string }) => {
      return guestApi.post('/newsletter/unsubscribe', data);
    },
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Abonelik iptal edilemedi.'),
  });

  // Token ile gelindiyse otomatik iptal
  useEffect(() => {
    if (tokenParam && !success && !unsubscribeMutation.isPending) {
      unsubscribeMutation.mutate({ token: tokenParam });
    }
  }, [tokenParam]);

  const handleSubmit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return Alert.alert('Eksik', 'Geçerli bir e-posta girin.');
    unsubscribeMutation.mutate({ email: email.trim().toLowerCase() });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Abonelik İptali" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={success ? 'checkmark-circle' : 'mail-unread-outline'}
              size={72}
              color={success ? TarodanColors.success : TarodanColors.primary}
            />
          </View>

          {success ? (
            <>
              <Text style={styles.title}>Aboneliğiniz İptal Edildi</Text>
              <Text style={styles.subtitle}>
                Artık bültenimizden e-posta almayacaksınız. Fikriniz değişirse tekrar abone olabilirsiniz.
              </Text>
              <Button
                mode="contained"
                buttonColor={TarodanColors.primary}
                onPress={() => router.replace('/')}
                style={styles.btn}
              >
                Ana Sayfaya Dön
              </Button>
            </>
          ) : (
            <>
              <Text style={styles.title}>Bülten Aboneliğini İptal Et</Text>
              <Text style={styles.subtitle}>
                E-posta adresinizi girin, aboneliğinizi anında iptal edelim. Bağlantıyla geldiğiniz halde bu sayfayı görüyorsanız otomatik iptal başarısız olmuş olabilir.
              </Text>

              <TextInput
                mode="outlined"
                label="E-posta *"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />

              <Button
                mode="contained"
                buttonColor={TarodanColors.error}
                onPress={handleSubmit}
                loading={unsubscribeMutation.isPending}
                disabled={unsubscribeMutation.isPending || !email}
                style={styles.btn}
                contentStyle={{ paddingVertical: 4 }}
              >
                Aboneliğimi İptal Et
              </Button>

              <Button
                mode="text"
                textColor={TarodanColors.textSecondary}
                onPress={() => router.back()}
              >
                Vazgeç
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  scrollBody: {
    padding: 24,
    gap: 10,
    alignItems: 'stretch',
  },
  iconWrap: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  input: {
    backgroundColor: TarodanColors.background,
  },
  btn: {
    borderRadius: 10,
    marginTop: 8,
  },
});
