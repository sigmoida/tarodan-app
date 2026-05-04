import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Button, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, Text, TextInput } from '../../src/components/common';
import { useAuthStore } from '../../src/stores/authStore';

export default function VerifyEmailScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const { isAuthenticated, user } = useAuthStore();
  const [manualToken, setManualToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: (token: string) => authApi.verifyEmail(token),
    onSuccess: () => {
      setStatus('success');
      setErrorMsg(null);
    },
    onError: (e: any) => {
      setStatus('error');
      setErrorMsg(e?.response?.data?.message || 'Bağlantı geçersiz veya süresi dolmuş olabilir.');
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () => {
      Alert.alert(
        'Gönderildi',
        'Yeni bir doğrulama bağlantısı e-posta adresinize gönderildi. Spam kutunuzu da kontrol etmeyi unutmayın.',
      );
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Doğrulama bağlantısı gönderilemedi.'),
  });

  useEffect(() => {
    if (tokenParam && status === 'idle') {
      setStatus('verifying');
      verifyMutation.mutate(tokenParam);
    }
  }, [tokenParam]);

  const handleManual = () => {
    if (!manualToken.trim()) return Alert.alert('Eksik', 'Doğrulama kodunu girin.');
    setStatus('verifying');
    verifyMutation.mutate(manualToken.trim());
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="E-posta Doğrulama" />

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={status === 'success' ? 'mail-open' : status === 'error' ? 'alert-circle' : 'mail'}
            size={72}
            color={status === 'success' ? TarodanColors.success : status === 'error' ? TarodanColors.error : TarodanColors.primary}
          />
        </View>

        {status === 'verifying' ? (
          <>
            <Text style={styles.title}>Doğrulanıyor...</Text>
            <ActivityIndicator color={TarodanColors.primary} style={{ marginTop: 12 }} />
          </>
        ) : status === 'success' ? (
          <>
            <Text style={styles.title}>E-postanız doğrulandı</Text>
            <Text style={styles.subtitle}>
              Hesabınız aktif. Artık tüm özelliklerden yararlanabilirsiniz.
            </Text>
            <Button
              mode="contained"
              buttonColor={TarodanColors.primary}
              onPress={() => router.replace(isAuthenticated ? '/(tabs)' : '/(auth)/login')}
              style={styles.btn}
              contentStyle={{ paddingVertical: 4 }}
            >
              Devam Et
            </Button>
          </>
        ) : status === 'error' ? (
          <>
            <Text style={styles.title}>Doğrulama Başarısız</Text>
            <Text style={styles.subtitle}>
              {errorMsg || 'Bağlantı geçersiz olabilir. Yeni bir doğrulama bağlantısı isteyebilirsiniz.'}
            </Text>
            {isAuthenticated ? (
              <Button
                mode="contained"
                buttonColor={TarodanColors.primary}
                icon="email-send-outline"
                onPress={() => resendMutation.mutate()}
                loading={resendMutation.isPending}
                disabled={resendMutation.isPending}
                style={styles.btn}
              >
                Yeni Bağlantı Gönder
              </Button>
            ) : null}
            <Button
              mode="text"
              onPress={() => router.replace('/(auth)/login')}
              textColor={TarodanColors.textSecondary}
            >
              Giriş Ekranına Dön
            </Button>
          </>
        ) : (
          <>
            <Text style={styles.title}>E-posta Doğrulama</Text>
            <Text style={styles.subtitle}>
              {user?.email
                ? `${user.email} adresine gönderdiğimiz bağlantıya tıklayarak doğrulayabilirsiniz. Kod aldıysanız aşağıya yapıştırabilirsiniz.`
                : 'E-posta adresinize gönderdiğimiz bağlantıya tıklayarak doğrulayabilirsiniz. Kod aldıysanız aşağıya yapıştırabilirsiniz.'}
            </Text>

            <TextInput
              mode="outlined"
              label="Doğrulama Kodu"
              value={manualToken}
              onChangeText={setManualToken}
              autoCapitalize="none"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />

            <Button
              mode="contained"
              buttonColor={TarodanColors.primary}
              onPress={handleManual}
              style={styles.btn}
              contentStyle={{ paddingVertical: 4 }}
              disabled={!manualToken.trim()}
            >
              Kodu Doğrula
            </Button>

            {isAuthenticated ? (
              <Button
                mode="text"
                icon="email-send-outline"
                onPress={() => resendMutation.mutate()}
                loading={resendMutation.isPending}
                disabled={resendMutation.isPending}
                textColor={TarodanColors.primary}
              >
                Yeniden Gönder
              </Button>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  scrollBody: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  iconWrap: {
    marginTop: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  input: {
    width: '100%',
    backgroundColor: TarodanColors.background,
    marginTop: 16,
  },
  btn: {
    width: '100%',
    borderRadius: 10,
    marginTop: 12,
  },
});
