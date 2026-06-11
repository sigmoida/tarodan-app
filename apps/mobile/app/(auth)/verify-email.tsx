import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Input,
  ScreenHeader,
  Spinner,
  Text,
  VStack,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

const { colors, spacing } = theme;

type Status = 'idle' | 'verifying' | 'success' | 'error';

export default function VerifyEmailScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const { isAuthenticated, user } = useAuthStore();
  const [manualToken, setManualToken] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: (token: string) => authApi.verifyEmail(token),
    onSuccess: () => {
      setStatus('success');
      setErrorMsg(null);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setStatus('error');
      setErrorMsg(err?.response?.data?.message || 'Bağlantı geçersiz veya süresi dolmuş olabilir.');
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendVerification(user?.email ?? ''),
    onSuccess: () => {
      appAlert(
        'Gönderildi',
        'Yeni bir doğrulama bağlantısı e-posta adresinize gönderildi. Spam kutunuzu da kontrol etmeyi unutmayın.',
      );
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      appAlert('Hata', err?.response?.data?.message || 'Doğrulama bağlantısı gönderilemedi.');
    },
  });

  useEffect(() => {
    if (tokenParam && status === 'idle') {
      setStatus('verifying');
      verifyMutation.mutate(tokenParam);
    }
  }, [tokenParam, status, verifyMutation]);

  const handleManual = () => {
    if (!manualToken.trim()) return appAlert('Eksik', 'Doğrulama kodunu girin.');
    setStatus('verifying');
    verifyMutation.mutate(manualToken.trim());
  };

  const iconName =
    status === 'success' ? 'mail-open' : status === 'error' ? 'alert-circle' : 'mail';
  const iconColor =
    status === 'success'
      ? colors.success[600]!
      : status === 'error'
        ? colors.danger[600]!
        : colors.primary[600]!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.DEFAULT }}>
      <ScreenHeader title="E-posta Doğrulama" onBack={() => router.back()} />

      <VStack gap={2} align="center" padding={6} flex={1}>
        <View style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>
          <Ionicons name={iconName} size={72} color={iconColor} />
        </View>

        {status === 'verifying' ? (
          <>
            <Text variant="h2" align="center">
              Doğrulanıyor...
            </Text>
            <Spinner color={colors.primary[600]!} />
          </>
        ) : status === 'success' ? (
          <>
            <Text variant="h2" align="center">
              E-postanız doğrulandı
            </Text>
            <Text variant="bodySm" tone="muted" align="center">
              Hesabınız aktif. Artık tüm özelliklerden yararlanabilirsiniz.
            </Text>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              title="Devam Et"
              onPress={() =>
                router.replace(isAuthenticated ? '/(tabs)' : '/(auth)/login')
              }
              style={{ marginTop: spacing[3] }}
            />
          </>
        ) : status === 'error' ? (
          <>
            <Text variant="h2" align="center">
              Doğrulama Başarısız
            </Text>
            <Text variant="bodySm" tone="muted" align="center">
              {errorMsg || 'Bağlantı geçersiz olabilir. Yeni bir doğrulama bağlantısı isteyebilirsiniz.'}
            </Text>
            {isAuthenticated ? (
              <Button
                variant="primary"
                size="lg"
                fullWidth
                title="Yeni Bağlantı Gönder"
                icon="mail-outline"
                onPress={() => resendMutation.mutate()}
                isLoading={resendMutation.isPending}
                disabled={resendMutation.isPending || !user?.email}
                style={{ marginTop: spacing[3] }}
              />
            ) : null}
            <Button
              variant="ghost"
              fullWidth
              title="Giriş Ekranına Dön"
              onPress={() => router.replace('/(auth)/login')}
            />
          </>
        ) : (
          <>
            <Text variant="h2" align="center">
              E-posta Doğrulama
            </Text>
            <Text variant="bodySm" tone="muted" align="center">
              {user?.email
                ? `${user.email} adresine gönderdiğimiz bağlantıya tıklayarak doğrulayabilirsiniz. Kod aldıysanız aşağıya yapıştırabilirsiniz.`
                : 'E-posta adresinize gönderdiğimiz bağlantıya tıklayarak doğrulayabilirsiniz. Kod aldıysanız aşağıya yapıştırabilirsiniz.'}
            </Text>

            <Input
              label="Doğrulama Kodu"
              value={manualToken}
              onChangeText={setManualToken}
              autoCapitalize="none"
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              title="Kodu Doğrula"
              onPress={handleManual}
              disabled={!manualToken.trim()}
            />

            {isAuthenticated ? (
              <Button
                variant="ghost"
                fullWidth
                title="Yeniden Gönder"
                icon="mail-outline"
                onPress={() => resendMutation.mutate()}
                isLoading={resendMutation.isPending}
                disabled={resendMutation.isPending || !user?.email}
              />
            ) : null}
          </>
        )}
      </VStack>
    </View>
  );
}
