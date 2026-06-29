import { View, ScrollView, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Button } from '@tarodan/ui-native';
import { useAuthStore } from '../src/stores/authStore';

const { colors } = theme;

/**
 * Kurumsal başvuru reddedildi ekranı. Web karşılığı:
 * apps/web/src/app/business-rejected/page.tsx. BusinessMembershipGuard,
 * businessStatus === 'rejected' olan kurumsal hesapları buraya kilitler;
 * yalnızca bu ekran, /contact, /login ve çıkış serbesttir.
 */
export default function BusinessRejectedScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Ionicons name="close-circle-outline" size={44} color={colors.danger[600]!} />
        </View>

        <Text variant="h2" style={styles.title}>Başvurunuz Reddedildi</Text>
        <Text variant="body" style={styles.text}>
          <Text variant="body" weight="semibold" style={styles.strong}>
            {user?.companyName}
          </Text>{' '}
          adına yaptığınız şirket hesabı başvurusu onaylanmadı.
        </Text>
        <Text variant="body" style={styles.subText}>
          Red gerekçesi{' '}
          <Text variant="body" weight="semibold" style={styles.strong}>
            {user?.email}
          </Text>{' '}
          adresinize e-posta ile gönderilmiştir.
        </Text>

        <View style={styles.infoBox}>
          <Text variant="body" style={styles.infoText}>
            Başvurunuzun reddedildiğini düşünüyorsanız veya eksik bilgi olduğuna
            inanıyorsanız destek ekibiyle iletişime geçebilirsiniz.
          </Text>
        </View>

        <Button
          variant="primary"
          title="Destek Ekibiyle İletişime Geç"
          onPress={() => router.push('/contact')}
          style={styles.button}
        />
        <Button
          variant="ghost"
          title="Çıkış Yap"
          onPress={handleLogout}
          style={styles.button}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.DEFAULT },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.danger[100]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontWeight: 'bold', color: colors.text.heading, textAlign: 'center' },
  text: { marginTop: 12, textAlign: 'center', color: colors.text.muted },
  subText: { marginTop: 8, textAlign: 'center', color: colors.text.muted },
  strong: { color: colors.text.heading },
  infoBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.danger[50]!,
    borderWidth: 1,
    borderColor: colors.danger[200]!,
    alignSelf: 'stretch',
  },
  infoText: { color: colors.danger[700]!, lineHeight: 20 },
  button: { marginTop: 16, alignSelf: 'stretch' },
});
