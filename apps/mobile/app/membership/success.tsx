import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';
import LottieView from 'lottie-react-native';

export default function MembershipSuccessScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color={TarodanColors.success} />
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
            <Ionicons name="infinite" size={24} color={TarodanColors.primary} />
            <Text style={styles.featureText}>Sınırsız İlan</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="swap-horizontal" size={24} color={TarodanColors.primary} />
            <Text style={styles.featureText}>Takas Özelliği</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="car-sport" size={24} color={TarodanColors.primary} />
            <Text style={styles.featureText}>Digital Garage</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="star" size={24} color={TarodanColors.primary} />
            <Text style={styles.featureText}>Öne Çıkan İlanlar</Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <Button
            mode="contained"
            onPress={() => router.replace('/(tabs)')}
            style={styles.primaryButton}
            buttonColor={TarodanColors.primary}
          >
            Ana Sayfaya Git
          </Button>
          <Button
            mode="outlined"
            onPress={() => router.push('/settings/my-listings')}
            style={styles.secondaryButton}
            textColor={TarodanColors.primary}
          >
            İlanlarımı Gör
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  features: {
    width: '100%',
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 4,
  },
  secondaryButton: {
    borderRadius: 12,
    borderColor: TarodanColors.primary,
  },
});
