import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { theme, Button, Input, Text } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { guestApi } from '../../src/services/api';
import { ScreenHeader } from '../../src/components/common';

const { colors } = theme;

export default function NewsletterScreen() {
  const [email, setEmail] = useState('');

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      // Web paritesi (newsletter/page.tsx): NewsletterSubscribeDto yalnızca email/newsletter
      // kabul eder; backend 'name' alanını desteklemez (whitelist ile sessizce strip edilir).
      return guestApi.post('/newsletter/subscribe', {
        email: email.trim().toLowerCase(),
        newsletter: true,
      });
    },
    onSuccess: () => {
      Alert.alert(
        'Teşekkürler',
        'Bültenimize abone oldunuz. En yeni ürünler ve kampanyalardan ilk siz haberdar olacaksınız.',
        [{ text: 'Tamam', onPress: () => router.back() }],
      );
      setEmail('');
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Abonelik kaydedilemedi.'),
  });

  const handleSubmit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return Alert.alert('Eksik', 'Geçerli bir e-posta girin.');
    subscribeMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Haber Bülteni" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-unread-outline" size={72} color={colors.primary[600]!} />
          </View>

          <Text style={styles.title}>Yeniliklerden Haberdar Olun</Text>
          <Text style={styles.subtitle}>
            Yeni modeller, özel koleksiyonlar ve kampanyalar için bültenimize abone olun. İstediğiniz zaman aboneliğinizi iptal edebilirsiniz.
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
            variant="primary"
            title="Abone Ol"
            onPress={handleSubmit}
            isLoading={subscribeMutation.isPending}
            disabled={subscribeMutation.isPending || !email}
            style={styles.btn}
          />

          <Button
            variant="ghost"
            title="Aboneliğimi İptal Etmek İstiyorum"
            onPress={() => router.push('/newsletter/unsubscribe' as any)}
          />

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
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.surface.DEFAULT,
  },
  btn: {
    borderRadius: 10,
    marginTop: 8,
  },
});
