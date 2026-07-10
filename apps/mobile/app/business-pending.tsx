import { View, ScrollView, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Button } from '@tarodan/ui-native';
import { useAuthStore } from '@/stores/authStore';

const { colors } = theme;

/**
 * Kurumsal başvuru onay sürecinde ekranı. Web karşılığı:
 * apps/web/src/app/business-pending/page.tsx. BusinessMembershipGuard,
 * businessStatus === 'pending' olan kurumsal hesapları buraya kilitler;
 * yalnızca bu ekran, /contact ve çıkış serbesttir.
 */
export default function BusinessPendingScreen() {
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
          <Ionicons name="time-outline" size={44} color={colors.warning[600]!} />
        </View>

        <Text variant="h2" style={styles.title}>Başvurunuz İnceleniyor</Text>
        <Text variant="body" style={styles.text}>
          <Text variant="body" weight="semibold" style={styles.strong}>
            {user?.companyName}
          </Text>{' '}
          adına yaptığınız başvuru onay sürecindedir.
        </Text>
        <Text variant="body" style={styles.subText}>
          Ekibimiz incelemeyi tamamladığında{' '}
          <Text variant="body" weight="semibold" style={styles.strong}>
            {user?.email}
          </Text>{' '}
          adresinize bilgi gönderilecektir. Bu işlem genellikle 1–2 iş günü sürer.
        </Text>

        <View style={styles.infoBox}>
          <Text variant="body" weight="semibold" style={styles.infoTitle}>
            Onay sürecinde neler olur?
          </Text>
          <Text variant="body" style={styles.infoItem}>
            1. Ekibimiz şirket bilgileri ve vergi kimlik numaranızı doğrular.
          </Text>
          <Text variant="body" style={styles.infoItem}>
            2. Onaylandığında hesabınız aktif olur ve e-posta ile bilgilendirilirsiniz.
          </Text>
          <Text variant="body" style={styles.infoItem}>
            3. Reddedilmesi durumunda red gerekçesiyle birlikte e-posta alırsınız.
          </Text>
        </View>

        <Button
          variant="outline"
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
    backgroundColor: colors.warning[100]!,
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
    backgroundColor: colors.warning[50]!,
    borderWidth: 1,
    borderColor: colors.warning[200]!,
    alignSelf: 'stretch',
  },
  infoTitle: { color: colors.warning[700]!, marginBottom: 8 },
  infoItem: { color: colors.warning[700]!, marginTop: 4, lineHeight: 20 },
  button: { marginTop: 16, alignSelf: 'stretch' },
});
