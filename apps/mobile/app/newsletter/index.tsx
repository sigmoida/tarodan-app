import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { guestApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, Text, TextInput } from '../../src/components/common';

export default function NewsletterScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      return guestApi.post('/newsletter/subscribe', {
        email: email.trim().toLowerCase(),
        name: name.trim() || undefined,
      });
    },
    onSuccess: () => {
      Alert.alert(
        'Teşekkürler',
        'Bültenimize abone oldunuz. En yeni ürünler ve kampanyalardan ilk siz haberdar olacaksınız.',
        [{ text: 'Tamam', onPress: () => router.back() }],
      );
      setEmail('');
      setName('');
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
            <Ionicons name="mail-unread-outline" size={72} color={TarodanColors.primary} />
          </View>

          <Text style={styles.title}>Yeniliklerden Haberdar Olun</Text>
          <Text style={styles.subtitle}>
            Yeni modeller, özel koleksiyonlar ve kampanyalar için bültenimize abone olun. İstediğiniz zaman aboneliğinizi iptal edebilirsiniz.
          </Text>

          <TextInput
            mode="outlined"
            label="Adınız (opsiyonel)"
            value={name}
            onChangeText={setName}
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />
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
            buttonColor={TarodanColors.primary}
            onPress={handleSubmit}
            loading={subscribeMutation.isPending}
            disabled={subscribeMutation.isPending || !email}
            style={styles.btn}
            contentStyle={{ paddingVertical: 4 }}
          >
            Abone Ol
          </Button>

          <Button
            mode="text"
            textColor={TarodanColors.textSecondary}
            onPress={() => router.push('/newsletter/unsubscribe' as any)}
          >
            Aboneliğimi İptal Etmek İstiyorum
          </Button>
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
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    backgroundColor: TarodanColors.background,
  },
  btn: {
    borderRadius: 10,
    marginTop: 8,
  },
});
