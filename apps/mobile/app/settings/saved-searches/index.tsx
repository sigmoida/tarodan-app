import { View, ScrollView, TouchableOpacity } from "react-native";
import { Button, Spinner, Text, ScreenHeader, theme } from "@tarodan/ui-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSavedSearches } from "./_hooks/useSavedSearches";
import { styles } from "./_lib/styles";
import { SavedSearchCard } from "./_components/SavedSearchCard";

const { colors } = theme;

export default function SavedSearchesScreen() {
  const { t } = useTranslation();
  const f = useSavedSearches();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons
          name="search-outline"
          size={64}
          color={colors.primary[600]!}
        />
        <Text variant="h3" style={styles.title}>
          Kayıtlı Aramalar
        </Text>
        <Text variant="body" style={styles.subtitle}>
          Aramalarınızı kaydetmek için giriş yapın
        </Text>
        <Button
          variant="primary"
          title="Giriş Yap"
          onPress={() => router.push("/(auth)/login")}
          style={{ alignSelf: "center" }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("mobile.settingsSavedSearches")}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)")
        }
        right={
          <Text style={styles.headerCount}>
            {f.searches.length}/
            {f.maxSavedSearches === -1 ? "∞" : f.maxSavedSearches}
          </Text>
        }
      />

      {/* Limit Info */}
      {f.maxSavedSearches !== -1 &&
        f.searches.length >= f.maxSavedSearches - 1 && (
          <View style={styles.limitBanner}>
            <Ionicons
              name="information-circle"
              size={20}
              color={colors.warning[600]!}
            />
            <Text style={styles.limitText}>
              {f.searches.length >= f.maxSavedSearches
                ? "Arama limitine ulaştınız"
                : `${f.maxSavedSearches - f.searches.length} arama hakkı kaldı`}
            </Text>
            <TouchableOpacity onPress={() => router.push("/upgrade")}>
              <Text style={styles.upgradeLink}>Premium</Text>
            </TouchableOpacity>
          </View>
        )}

      {f.isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : f.searches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="search-outline"
            size={80}
            color={colors.text.subtle}
          />
          <Text variant="h3" style={styles.emptyTitle}>
            Kayıtlı arama yok
          </Text>
          <Text variant="body" style={styles.emptySubtitle}>
            Arama sayfasında arama yapıp "Aramayı Kaydet" butonuna tıklayın
          </Text>
          <Button
            variant="primary"
            title="Aramaya Git"
            onPress={() => router.push("/(tabs)/search")}
            style={{ alignSelf: "center" }}
          />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {f.searches.map((search) => (
            <SavedSearchCard key={search.id} search={search} f={f} />
          ))}
          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </View>
  );
}
