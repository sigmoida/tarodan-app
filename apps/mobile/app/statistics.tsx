import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Stack, router } from 'expo-router';
import { Button } from 'react-native-paper';
import { TarodanColors } from '../src/theme';

export default function StatisticsScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'İstatistikler' }} />
      <View style={styles.content}>
        <Text variant="bodyLarge" style={styles.text}>
          Detaylı istatistikler için Analytics sayfasını kullanabilirsiniz.
        </Text>
        <Button mode="contained" onPress={() => router.push('/settings/analytics')} style={styles.button}>
          Analytics'e Git
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TarodanColors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { textAlign: 'center', color: TarodanColors.textSecondary },
  button: { marginTop: 16 },
});
