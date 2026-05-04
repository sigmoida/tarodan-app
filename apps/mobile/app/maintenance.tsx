import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

export default function MaintenanceScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Bakım' }} />
      <View style={styles.content}>
        <Ionicons name="construct-outline" size={64} color={TarodanColors.textSecondary} />
        <Text variant="headlineSmall" style={styles.title}>Bakım Çalışması</Text>
        <Text variant="bodyLarge" style={styles.text}>
          Şu an bakım çalışması yapılıyor. Kısa süre sonra tekrar hizmetinizdeyiz.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TarodanColors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { marginTop: 16, fontWeight: 'bold', color: TarodanColors.textPrimary },
  text: { marginTop: 8, textAlign: 'center', color: TarodanColors.textSecondary },
});
