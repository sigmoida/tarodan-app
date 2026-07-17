import { View, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, Text, ScreenHeader } from "@tarodan/ui-native";
import { useTranslation } from "react-i18next";

const { colors } = theme;

const STEPS = [
  {
    icon: "search-outline" as const,
    title: "Ürün Bulun",
    description: '"Takas Açık" etiketli ürünleri arayın veya filtreleyin.',
  },
  {
    icon: "swap-horizontal-outline" as const,
    title: "Teklif Gönderin",
    description:
      "Kendi koleksiyonunuzdan ürün seçin, gerekirse nakit fark ekleyin ve teklif gönderin.",
  },
  {
    icon: "chatbubbles-outline" as const,
    title: "Müzakere Edin",
    description:
      "Karşı taraf kabul edebilir, reddedebilir veya karşı teklif gönderebilir.",
  },
  {
    icon: "checkmark-circle-outline" as const,
    title: "Onaylayın",
    description:
      "Her iki taraf da takas şartlarını kabul ettiğinde takas resmi olarak başlar.",
  },
  {
    icon: "cube-outline" as const,
    title: "Kargolayın",
    description:
      "Ürünlerinizi güvenli şekilde paketleyerek belirtilen süre içinde kargoya verin.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Teslim Alın ve Onaylayın",
    description:
      'Ürünü kontrol edin ve "Teslim Aldım" ile onaylayın. Takas tamamlanır.',
  },
];

export default function GuvenliTakasScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("mobile.pageSafeTrade")}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)")
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Ionicons
            name="swap-horizontal"
            size={56}
            color={colors.primary[600]!}
          />
          <Text style={styles.heroTitle}>Güvenli Takas Sistemi</Text>
          <Text style={styles.heroText}>
            Koleksiyonunuzu büyütmenin en kolay yolu. Platform güvencesi altında
            diğer koleksiyonerlerle model araçlarınızı takas edin.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Nasıl Çalışır?</Text>
        {STEPS.map((step, index) => (
          <View key={index} style={styles.stepCard}>
            <View style={styles.stepLeft}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
              </View>
              {index < STEPS.length - 1 && <View style={styles.stepLine} />}
            </View>
            <View style={styles.stepContent}>
              <View style={styles.stepIconRow}>
                <Ionicons
                  name={step.icon}
                  size={20}
                  color={colors.primary[600]!}
                />
                <Text style={styles.stepTitle}>{step.title}</Text>
              </View>
              <Text style={styles.stepDesc}>{step.description}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Güvenlik Garantileri</Text>
        <View style={styles.guaranteeCard}>
          <View style={styles.guaranteeRow}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.warning[500]!}
            />
            <Text style={styles.guaranteeText}>
              Her iki tarafın ürünleri platform garantisi altındadır
            </Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.warning[500]!}
            />
            <Text style={styles.guaranteeText}>
              Nakit fark ödemeleri güvenli emanet hesapta tutulur
            </Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.warning[500]!}
            />
            <Text style={styles.guaranteeText}>
              Anlaşmazlık durumunda platform arabuluculuk yapar
            </Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.warning[500]!}
            />
            <Text style={styles.guaranteeText}>
              Ürün açıklamaya uymuyorsa takas iptal edilebilir
            </Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.warning[500]!}
            />
            <Text style={styles.guaranteeText}>
              Kargo takibi her iki taraf için de platformda görüntülenir
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Kimler Takas Yapabilir?</Text>
        <Text style={styles.paragraph}>
          Takas özelliği Premium ve Pro üyelere açıktır. Takas yapmak için en az
          bir aktif ilanınızın bulunması ve hesabınızın doğrulanmış olması
          gerekmektedir.
        </Text>

        <Text style={styles.sectionTitle}>Fark Ödemeli Takas</Text>
        <Text style={styles.paragraph}>
          Takas edilen ürünlerin değerleri eşit olmak zorunda değildir. Teklifte
          nakit fark belirleyebilirsiniz. Fark ödemesi, güvenli ödeme sistemi
          üzerinden alıcı koruma kapsamında işlenir.
        </Text>

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push("/trades")}
          activeOpacity={0.8}
        >
          <Ionicons name="swap-horizontal" size={20} color={colors.white} />
          <Text style={styles.ctaText}>Takas Tekliflerini Keşfet</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    padding: theme.spacing[5],
  },
  hero: {
    alignItems: "center",
    paddingVertical: theme.spacing[6],
    marginBottom: theme.spacing[2],
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.text.heading,
    marginTop: theme.spacing[3],
  },
  heroText: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
    textAlign: "center",
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[2.5],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text.heading,
    marginTop: theme.spacing[6],
    marginBottom: theme.spacing[4],
  },
  stepCard: {
    flexDirection: "row",
    marginBottom: theme.spacing[1],
  },
  stepLeft: {
    alignItems: "center",
    width: 36,
    marginRight: theme.spacing[3],
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary[600]!,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: "bold",
    color: colors.white,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.primary[200]!,
    marginVertical: theme.spacing[1],
  },
  stepContent: {
    flex: 1,
    paddingBottom: theme.spacing[5],
  },
  stepIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.heading,
  },
  stepDesc: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
  },
  guaranteeCard: {
    backgroundColor: colors.warning[50]!,
    borderRadius: 12,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  guaranteeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2.5],
  },
  guaranteeText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
  },
  paragraph: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
    marginBottom: theme.spacing[3],
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[600]!,
    paddingVertical: theme.spacing[3.5],
    borderRadius: 12,
    marginTop: theme.spacing[6],
    gap: theme.spacing[2],
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
  },
});
