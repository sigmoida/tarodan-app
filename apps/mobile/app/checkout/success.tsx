import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Card, Text, theme } from '@tarodan/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const { colors } = theme;

export default function CheckoutSuccessScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Success Animation/Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={60} color={colors.white} />
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
          <View style={styles.infoItem}>
            <Ionicons name="mail-outline" size={24} color={colors.primary[600]!} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>E-posta Bildirimi</Text>
              <Text style={styles.infoText}>Sipariş detayları e-posta adresinize gönderildi.</Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={24} color={colors.primary[600]!} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Kargo Takibi</Text>
              <Text style={styles.infoText}>Kargo bilgileri satıcı tarafından girildiğinde bilgilendirileceksiniz.</Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.primary[600]!} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Satıcı İletişimi</Text>
              <Text style={styles.infoText}>Mesajlar bölümünden satıcıyla iletişime geçebilirsiniz.</Text>
            </View>
          </View>
        </Card>

        {/* Buttons */}
        <View style={styles.buttons}>
          <Button
            variant="primary"
            title="Siparişlerimi Gör"
            onPress={() => router.replace('/orders')}
            style={styles.primaryButton}
            icon="cube-outline"
          />
          <Button
            variant="outline"
            title="Alışverişe Devam Et"
            onPress={() => router.replace('/(tabs)')}
            style={styles.secondaryButton}
          />
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
    backgroundColor: colors.surface.DEFAULT,
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
    backgroundColor: colors.success[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.heading,
    textAlign: 'center',
    marginBottom: 12,
  },
  orderIdContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  orderIdLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  orderIdValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary[600]!,
    marginTop: 4,
  },
  description: {
    fontSize: 15,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  infoCard: {
    marginBottom: 32,
    backgroundColor: colors.surface.alt,
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
    color: colors.text.heading,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: colors.text.muted,
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
    borderColor: colors.primary[600]!,
  },
  supportText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
  },
  supportLink: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
