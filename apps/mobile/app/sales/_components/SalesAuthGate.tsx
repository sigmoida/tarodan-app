import { View } from 'react-native';
import { Button, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';

const { colors } = theme;

/** Giriş yapmamış kullanıcıya satışlar yerine gösterilen giriş çağrısı. */
export function SalesAuthGate() {
  return (
    <View style={styles.centeredContainer}>
      <Ionicons name="storefront-outline" size={64} color={colors.primary[600]!} />
      <Text variant="h2" style={styles.title}>Satışlarım</Text>
      <Text variant="body" tone="muted" style={styles.subtitle}>
        Satışlarınızı görmek için giriş yapın
      </Text>
      <Button
        variant="primary"
        title="Giriş Yap"
        onPress={() => router.push('/(auth)/login')}
        style={{ alignSelf: 'center' }}
      />
    </View>
  );
}
