import { View, TouchableOpacity } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/browseStyles';

const { colors } = theme;

/** Digital Garage upsell bilgi kartı — premium olmayan üyeye gösterilir. */
export function CollectionsInfoCard({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <View style={styles.infoCard}>
      <Ionicons name="information-circle" size={24} color={colors.info[600]!} />
      <View style={styles.infoContent}>
        <Text style={styles.infoTitle}>Digital Garage Nedir?</Text>
        <Text style={styles.infoText}>
          Koleksiyonunuzu sergileyin, diğer koleksiyonerleri keşfedin ve ilham alın.
          Premium üyeler kendi garajlarını oluşturabilir.
        </Text>
        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => router.push(isAuthenticated ? '/upgrade' : '/(auth)/login')}
        >
          <Text style={styles.infoButtonText}>Premium Üye Ol</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary[600]!} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
