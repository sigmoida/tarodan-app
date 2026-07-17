import { View, ScrollView, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { theme, Text, Card, ScreenHeader } from "@tarodan/ui-native";
import { useTranslation } from "react-i18next";
import { SUPPORT_EMAIL } from "@/constants/legalFacts";

const { colors } = theme;

const sections = [
  {
    title: "1. Alıcı Koruma Nedir?",
    icon: "shield-checkmark-outline" as const,
    content:
      "TARODAN Alıcı Koruma programı, platform üzerinden yaptığınız alışverişlerde ürünün tanıma uygun gelmemesi, hiç gönderilmemesi veya ciddi anlaşmazlık durumlarında inceleme ve gerekirse para iadesi süreçlerini kapsar.",
  },
  {
    title: "2. Kapsam",
    icon: "list-outline" as const,
    content:
      "• Platformda ödeme alınan siparişler\n• Ürün hiç kargolanmadı veya takip bilgisi verilmedi\n• Ürün açıklamaya ciddi şekilde aykırı\n• Sahte veya taklit ürün iddiası",
  },
  {
    title: "3. Para İade Garantisi",
    icon: "cash-outline" as const,
    content:
      'Uygun koşullarda ve inceleme sonucunda para iadesi yapılabilir. "Para iade garantisi" her durumda otomatik iade anlamına gelmez; her talep ayrı ayrı incelenir.',
  },
  {
    title: "4. Anlaşmazlık Çözümü",
    icon: "chatbubbles-outline" as const,
    content:
      "1. Satıcı ile iletişime geçin\n2. Destek talebi açın (Hesabım → Siparişlerim → Sorun bildir)\n3. Ekibimiz durumu inceler\n4. Karar ve uygulama\n\nSüre: 5–10 iş günü.",
  },
  {
    title: "5. Sizin Yapmanız Gerekenler",
    icon: "checkbox-outline" as const,
    content:
      "• Sipariş ve hasar fotoğraflarını saklayın\n• Kargo takip ve iletişim geçmişini paylaşın\n• Talep açıklamasını net yazın\n• Platform iletişimlerine zamanında cevap verin",
  },
  {
    title: "6. Sınırlamalar",
    icon: "warning-outline" as const,
    content:
      "Alıcı koruma yasal haklarınızın yerine geçmez; onlara ek olarak sunulur.",
  },
  {
    title: "7. İletişim",
    icon: "mail-outline" as const,
    content: `${SUPPORT_EMAIL} – konu: "Alıcı Koruma – Sipariş No"`,
  },
];

export default function BuyerProtectionScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("mobile.pageBuyerProtection")}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)")
        }
      />

      <View style={styles.hero}>
        <Ionicons name="shield-checkmark" size={40} color={colors.white} />
        <Text style={styles.heroTitle}>Alıcı Koruma Programı</Text>
        <Text style={styles.heroDate}>Son güncelleme: 24 Ocak 2026</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((section, i) => (
          <Card key={i} style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name={section.icon}
                size={20}
                color={colors.primary[600]!}
              />
              <Text variant="label" style={styles.sectionTitle}>
                {section.title}
              </Text>
            </View>
            <Text variant="body" style={styles.text}>
              {section.content}
            </Text>
          </Card>
        ))}

        <View style={styles.links}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push("/refund-policy" as any)}
          >
            <Text style={styles.linkText}>İade Politikası</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.primary[600]!}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push("/returns-exchanges" as any)}
          >
            <Text style={styles.linkText}>İade ve Değişim</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.primary[600]!}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push("/terms")}
          >
            <Text style={styles.linkText}>Kullanım Şartları</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.primary[600]!}
            />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  hero: {
    backgroundColor: colors.gray[800],
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[5],
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.white,
    marginTop: theme.spacing[3],
  },
  heroDate: {
    fontSize: 13,
    color: colors.gray[400],
    marginTop: theme.spacing[1.5],
  },
  content: { padding: theme.spacing[4] },
  card: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing[2.5],
    gap: theme.spacing[2],
  },
  sectionTitle: { fontWeight: "600", color: colors.text.heading, flex: 1 },
  text: { color: colors.text.muted, lineHeight: 22 },
  links: { marginTop: theme.spacing[2] },
  linkButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
    borderRadius: 12,
    marginBottom: theme.spacing[2],
  },
  linkText: { fontSize: 15, color: colors.primary[600]!, fontWeight: "500" },
});
