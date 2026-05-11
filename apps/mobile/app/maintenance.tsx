import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text } from '@tarodan/ui-native';

const { colors } = theme;

export default function MaintenanceScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Bakım' }} />
      <View style={styles.content}>
        <Ionicons name="construct-outline" size={64} color={colors.text.muted} />
        <Text variant="h2" style={styles.title}>Bakım Çalışması</Text>
        <Text variant="body" style={styles.text}>
          Şu an bakım çalışması yapılıyor. Kısa süre sonra tekrar hizmetinizdeyiz.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.DEFAULT },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { marginTop: 16, fontWeight: 'bold', color: colors.text.heading },
  text: { marginTop: 8, textAlign: 'center', color: colors.text.muted },
});
