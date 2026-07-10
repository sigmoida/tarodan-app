import { View, ScrollView, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';

const { colors } = theme;

export default function AboutScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={t('mobile.pageAbout')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="car-sport" size={48} color={colors.primary[600]!} />
          <Text variant="h1" style={styles.title}>Tarodan</Text>
          <Text variant="body" style={styles.subtitle}>
            Türkiye'nin diecast model araba pazarı
          </Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="book-outline" size={22} color={colors.primary[600]!} />
            <Text variant="h3" style={styles.sectionTitle}>Hikayemiz</Text>
          </View>
          <Text variant="body" style={styles.text}>
            Tarodan, koleksiyoncular ve satıcılar için güvenli bir pazar yeri sunmak amacıyla kuruldu.
            Alıcı ve satıcıyı bir araya getiriyoruz. Diecast model araba tutkunlarının güvenle
            alım, satım ve takas yapabileceği Türkiye'nin en kapsamlı platformuyuz.
          </Text>
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flag-outline" size={22} color={colors.primary[600]!} />
            <Text variant="h3" style={styles.sectionTitle}>Misyon</Text>
          </View>
          <Text variant="body" style={styles.text}>
            Misyonumuz, model araba tutkunlarına en iyi alışveriş ve takas deneyimini sunmaktır.
            Güvenli ödeme, korumalı takas ve geniş ürün yelpazesi ile koleksiyonculuğu herkes
            için erişilebilir kılıyoruz.
          </Text>
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="heart-outline" size={22} color={colors.primary[600]!} />
            <Text variant="h3" style={styles.sectionTitle}>Değerlerimiz</Text>
          </View>
          <Text variant="body" style={styles.text}>
            Değerlerimiz: güvenilirlik, şeffaflık ve koleksiyonculuk kültürüne saygı.
            Her işlemde kullanıcılarımızın güvenliğini ön planda tutarak,
            adil ve şeffaf bir ticaret ortamı sağlıyoruz.
          </Text>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  content: { padding: 16 },
  header: { alignItems: 'center', paddingVertical: 32 },
  title: { fontWeight: 'bold', color: colors.text.heading, marginTop: 12 },
  subtitle: { color: colors.text.muted, marginTop: 4, textAlign: 'center' },
  card: { marginBottom: 16, backgroundColor: colors.surface.DEFAULT },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontWeight: '600', marginLeft: 8, color: colors.text.heading },
  text: { color: colors.text.muted, lineHeight: 22 },
});
