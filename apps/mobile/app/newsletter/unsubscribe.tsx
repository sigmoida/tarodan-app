import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { theme, Button, Input, Text } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { guestApi } from '../../src/services/api';
import { ScreenHeader } from '../../src/components/common';

const { colors } = theme;

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
              color={success ? colors.success[600]! : colors.primary[600]!}
            />
          </View>

          {success ? (
            <>
              <Text style={styles.title}>Aboneliğiniz İptal Edildi</Text>
              <Text style={styles.subtitle}>
                Artık bültenimizden e-posta almayacaksınız. Fikriniz değişirse tekrar abone olabilirsiniz.
              </Text>
              <Button
                variant="primary"
                title="Ana Sayfaya Dön"
                fullWidth
                onPress={() => router.replace('/')}
                style={styles.btn}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>Bülten Aboneliğini İptal Et</Text>
              <Text style={styles.subtitle}>
                E-posta adresinizi girin, aboneliğinizi anında iptal edelim. Bağlantıyla geldiğiniz halde bu sayfayı görüyorsanız otomatik iptal başarısız olmuş olabilir.
              </Text>

              <Input
                label="E-posta *"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                containerStyle={styles.input}
              />

              <Button
                variant="danger"
                title="Aboneliğimi İptal Et"
                fullWidth
                onPress={handleSubmit}
                isLoading={unsubscribeMutation.isPending}
                disabled={unsubscribeMutation.isPending || !email}
                style={styles.btn}
              />

              <Button
                variant="ghost"
                title="Vazgeç"
                fullWidth
                onPress={() => router.back()}
              />
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
    backgroundColor: colors.surface.DEFAULT,
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
    color: colors.text.heading,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.surface.DEFAULT,
  },
  btn: {
    borderRadius: 10,
    marginTop: 8,
  },
});
