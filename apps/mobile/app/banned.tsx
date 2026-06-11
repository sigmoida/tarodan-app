import { View, StyleSheet } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Button } from '@tarodan/ui-native';
import { useAuthStore } from '../src/stores/authStore';
import { resetBannedRedirect } from '../src/services/api';

const { colors } = theme;

/**
 * Banlı kullanıcı ekranı. API interceptor'ı USER_BANNED (403) yakalayınca
 * buraya yönlendirir; geri navigasyon kapalıdır. Banlı kullanıcı yalnızca
 * destek talebi oluşturabilir veya çıkış yapabilir (backend BannedUserGuard
 * ile aynı izinler).
 */
export default function BannedScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    resetBannedRedirect();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.content}>
        <Ionicons name="ban-outline" size={64} color={colors.danger[600]!} />
        <Text variant="h2" style={styles.title}>Hesabınız Askıya Alındı</Text>
        <Text variant="body" style={styles.text}>
          Hesabınız kural ihlali nedeniyle banlanmıştır. Bunun bir hata olduğunu
          düşünüyorsanız destek ekibiyle iletişime geçebilirsiniz.
        </Text>
        {reason ? (
          <View style={styles.reasonBox}>
            <Text variant="caption" style={styles.reasonLabel}>Ban sebebi</Text>
            <Text variant="body" style={styles.reasonText}>{reason}</Text>
          </View>
        ) : null}
        <Button
          variant="primary"
          title="Destek Talebi Oluştur"
          onPress={() => router.push('/support')}
          style={styles.button}
        />
        <Button
          variant="outline"
          title="Çıkış Yap"
          onPress={handleLogout}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.DEFAULT },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { marginTop: 16, fontWeight: 'bold', color: colors.text.heading },
  text: { marginTop: 8, textAlign: 'center', color: colors.text.muted },
  reasonBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.danger[50]!,
    alignSelf: 'stretch',
  },
  reasonLabel: { color: colors.danger[600]!, fontWeight: 'bold' },
  reasonText: { marginTop: 4, color: colors.text.heading },
  button: { marginTop: 16, alignSelf: 'stretch' },
});
