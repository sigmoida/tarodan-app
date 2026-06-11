import { View, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { theme, Text, Button } from '@tarodan/ui-native';
import { useTranslation } from '../src/i18n';

const { colors } = theme;

export default function StatisticsScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('mobile.pageStatistics') }} />
      <View style={styles.content}>
        <Text variant="body" style={styles.text}>
          Detaylı istatistikler için Analytics sayfasını kullanabilirsiniz.
        </Text>
        <Button
          variant="primary"
          title="Analytics'e Git"
          onPress={() => router.push('/settings/analytics')}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.DEFAULT },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { textAlign: 'center', color: colors.text.muted },
  button: { marginTop: 16, alignSelf: 'center' },
});
