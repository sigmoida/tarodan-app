import { View, StyleSheet } from 'react-native';
import { theme, Button, Text } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const { colors } = theme;

export default function MembershipSuccessScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color={colors.success[600]!} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Üyelik Aktif!</Text>

        {/* Description */}
        <Text style={styles.description}>
          Premium üyeliğiniz başarıyla aktifleştirildi. Artık tüm özelliklerden yararlanabilirsiniz.
        </Text>

        {/* Features */}
        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="infinite" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Sınırsız İlan</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="swap-horizontal" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Takas Özelliği</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="car-sport" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Digital Garage</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="star" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Öne Çıkan İlanlar</Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <Button
            variant="primary"
            title="Ana Sayfaya Git"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
            style={styles.primaryButton}
          />
          <Button
            variant="outline"
            title="İlanlarımı Gör"
            fullWidth
            onPress={() => router.push('/settings/my-listings')}
            style={styles.secondaryButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  features: {
    width: '100%',
    backgroundColor: colors.surface.alt,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureText: {
    marginLeft: 16,
    fontSize: 15,
    color: colors.text.heading,
    fontWeight: '500',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 12,
  },
  secondaryButton: {
    borderRadius: 12,
    borderColor: colors.primary[600]!,
  },
});
