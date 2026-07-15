import { View, ScrollView } from 'react-native';
import { Text, Snackbar, Button, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { useSupportForm } from './_hooks/useSupportForm';
import { styles } from './_lib/styles';
import { SupportForm } from './_components/SupportForm';

const { colors } = theme;

export default function SupportScreen() {
  const { t } = useTranslation();
  const f = useSupportForm();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (!f.isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('mobile.pageSupport')} onBack={back} />
        <View style={styles.authRequired}>
          <Ionicons name="headset-outline" size={64} color={colors.primary[600]!} />
          <Text style={styles.authTitle}>Giriş Gerekli</Text>
          <Text style={styles.authSubtitle}>
            Destek talebi oluşturmak için giriş yapmanız gerekmektedir.
          </Text>
          <Button
            variant="primary"
            title="Giriş Yap"
            onPress={() => router.push('/(auth)/login')}
            style={{ alignSelf: 'center' }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Destek Talebi" onBack={back} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <SupportForm f={f} />
      </ScrollView>

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ ...f.snackbar, visible: false })}
        duration={3000}
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
