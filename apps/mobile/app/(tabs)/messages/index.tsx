import { View, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import {
  Badge,
  Input,
  Spinner,
  Text,
  theme,
  ScreenHeader,
} from "@tarodan/ui-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useMessagesTab } from "./_hooks/useMessagesTab";
import { styles } from "./_lib/styles";
import { ThreadRow } from "./_components/ThreadRow";

const { colors } = theme;

export default function MessagesTabScreen() {
  const { t } = useTranslation();
  const f = useMessagesTab();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t("mobile.messagesTitle")} showBack={false} />
        <View style={styles.centeredContainer}>
          <Ionicons
            name="chatbubbles-outline"
            size={64}
            color={colors.primary[600]!}
          />
          <Text variant="h3" style={styles.title}>
            {t("mobile.messagesTitle")}
          </Text>
          <Text variant="body" style={styles.subtitle}>
            Mesajlarınızı görmek için giriş yapın
          </Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("mobile.messagesTitle")}
        showBack={false}
        right={
          f.unreadCount > 0 ? (
            <Badge variant="danger" style={styles.headerBadge}>
              {f.unreadCount}
            </Badge>
          ) : undefined
        }
      />

      {/* Message Limit Banner */}
      {!f.isUnlimited && f.dailyMessageCount >= f.messageLimit - 10 && (
        <View style={styles.limitBanner}>
          <Ionicons
            name="information-circle"
            size={20}
            color={colors.warning[600]!}
          />
          <Text style={styles.limitText}>
            Günlük mesaj: {f.dailyMessageCount}/{f.messageLimit}
          </Text>
          {f.dailyMessageCount >= f.messageLimit && (
            <TouchableOpacity onPress={() => router.push("/upgrade")}>
              <Text style={styles.upgradeLink}>Premium'a Geç</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Input
          placeholder={t("mobile.searchInMessages")}
          value={f.searchQuery}
          onChangeText={f.setSearchQuery}
          leftIconName="search"
        />
      </View>

      {/* Content — ilk yükleme bitene dek spinner; boş ekran bir an çakmasın. */}
      {f.threads.length === 0 && (f.isLoading || !f.hasLoadedThreads) ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : f.filteredThreads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={80}
            color={colors.text.subtle}
          />
          <Text variant="h3" style={styles.emptyTitle}>
            {f.searchQuery ? "Sonuç bulunamadı" : "Henüz mesaj yok"}
          </Text>
          <Text variant="body" style={styles.emptySubtitle}>
            {f.searchQuery
              ? "Farklı bir arama terimi deneyin"
              : "Bir satıcıyla iletişime geçerek başlayın"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={f.filteredThreads}
          keyExtractor={(thread) => thread.id}
          style={styles.threadsList}
          refreshControl={
            <RefreshControl
              refreshing={f.refreshing}
              onRefresh={f.onRefresh}
              colors={[colors.primary[600]!]}
            />
          }
          ListFooterComponent={<View style={{ height: 100 }} />}
          renderItem={({ item }) => <ThreadRow thread={item} f={f} />}
        />
      )}
    </View>
  );
}
