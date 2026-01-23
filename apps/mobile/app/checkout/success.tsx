import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';

export default function CheckoutSuccessScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Success Animation/Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={60} color="#fff" />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Siparişiniz Alındı!</Text>

        {/* Order ID */}
        {orderId && (
          <View style={styles.orderIdContainer}>
            <Text style={styles.orderIdLabel}>Sipariş Numarası</Text>
            <Text style={styles.orderIdValue}>#{orderId}</Text>
          </View>
        )}

        {/* Description */}
        <Text style={styles.description}>
          Siparişiniz başarıyla oluşturuldu. Satıcı onayladıktan sonra kargoya verilecektir.
        </Text>

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.infoItem}>
              <Ionicons name="mail-outline" size={24} color={TarodanColors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>E-posta Bildirimi</Text>
                <Text style={styles.infoText}>Sipariş detayları e-posta adresinize gönderildi.</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="location-outline" size={24} color={TarodanColors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Kargo Takibi</Text>
                <Text style={styles.infoText}>Kargo bilgileri satıcı tarafından girildiğinde bilgilendirileceksiniz.</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="chatbubble-outline" size={24} color={TarodanColors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Satıcı İletişimi</Text>
                <Text style={styles.infoText}>Mesajlar bölümünden satıcıyla iletişime geçebilirsiniz.</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Buttons */}
        <View style={styles.buttons}>
          <Button
            mode="contained"
            onPress={() => router.replace('/orders')}
            style={styles.primaryButton}
            buttonColor={TarodanColors.primary}
            icon="package-variant"
          >
            Siparişlerimi Gör
          </Button>
          <Button
            mode="outlined"
            onPress={() => router.replace('/(tabs)')}
            style={styles.secondaryButton}
            textColor={TarodanColors.primary}
          >
            Alışverişe Devam Et
          </Button>
        </View>

        {/* Support Link */}
        <Text style={styles.supportText}>
          Bir sorun mu var?{' '}
          <Text style={styles.supportLink} onPress={() => router.push('/support')}>
            Destek alın
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: TarodanColors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  orderIdContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  orderIdLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  orderIdValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    marginTop: 4,
  },
  description: {
    fontSize: 15,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  infoCard: {
    marginBottom: 32,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  infoContent: {
    flex: 1,
    marginLeft: 16,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 18,
  },
  buttons: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 4,
  },
  secondaryButton: {
    borderRadius: 12,
    borderColor: TarodanColors.primary,
  },
  supportText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  supportLink: {
    color: TarodanColors.primary,
    fontWeight: '500',
  },
});
