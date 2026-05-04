import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';
import { useTranslation } from '../src/i18n';

export default function AboutScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('mobile.pageAbout') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="car-sport" size={48} color={TarodanColors.primary} />
          <Text variant="headlineMedium" style={styles.title}>Tarodan</Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Türkiye'nin diecast model araba pazarı
          </Text>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="book-outline" size={22} color={TarodanColors.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>Hikayemiz</Text>
            </View>
            <Text variant="bodyMedium" style={styles.text}>
              Tarodan, koleksiyoncular ve satıcılar için güvenli bir pazar yeri sunmak amacıyla kuruldu.
              Alıcı ve satıcıyı bir araya getiriyoruz. Diecast model araba tutkunlarının güvenle
              alım, satım ve takas yapabileceği Türkiye'nin en kapsamlı platformuyuz.
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="flag-outline" size={22} color={TarodanColors.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>Misyon</Text>
            </View>
            <Text variant="bodyMedium" style={styles.text}>
              Misyonumuz, model araba tutkunlarına en iyi alışveriş ve takas deneyimini sunmaktır.
              Güvenli ödeme, korumalı takas ve geniş ürün yelpazesi ile koleksiyonculuğu herkes
              için erişilebilir kılıyoruz.
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="heart-outline" size={22} color={TarodanColors.primary} />
              <Text variant="titleMedium" style={styles.sectionTitle}>Değerlerimiz</Text>
            </View>
            <Text variant="bodyMedium" style={styles.text}>
              Değerlerimiz: güvenilirlik, şeffaflık ve koleksiyonculuk kültürüne saygı.
              Her işlemde kullanıcılarımızın güvenliğini ön planda tutarak,
              adil ve şeffaf bir ticaret ortamı sağlıyoruz.
            </Text>
          </Card.Content>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TarodanColors.backgroundSecondary },
  content: { padding: 16 },
  header: { alignItems: 'center', paddingVertical: 32 },
  title: { fontWeight: 'bold', color: TarodanColors.textPrimary, marginTop: 12 },
  subtitle: { color: TarodanColors.textSecondary, marginTop: 4, textAlign: 'center' },
  card: { marginBottom: 16, backgroundColor: TarodanColors.background },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontWeight: '600', marginLeft: 8, color: TarodanColors.textPrimary },
  text: { color: TarodanColors.textSecondary, lineHeight: 22 },
});
