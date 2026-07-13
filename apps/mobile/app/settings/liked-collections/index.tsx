import { View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Spinner, Snackbar, Text, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { useLikedCollections } from './_hooks/useLikedCollections';
import { styles } from './_lib/styles';
import { LikedCollectionCard } from './_components/LikedCollectionCard';

const { colors } = theme;

export default function LikedCollectionsScreen() {
  const { t } = useTranslation();
  const f = useLikedCollections();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const title = t('mobile.settingsLikedCollections');

  if (!f.isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={title} onBack={back} />
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={64} color={colors.text.subtle} />
          <Text style={styles.emptyTitle}>Giriş Yapın</Text>
          <Text style={styles.emptySubtitle}>
            Beğendiğiniz koleksiyonları görmek için giriş yapmanız gerekiyor
          </Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={title} onBack={back} />

      {f.isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      ) : f.error ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.danger[600]!} />
          <Text style={styles.emptyTitle}>Bir Hata Oluştu</Text>
          <Text style={styles.emptySubtitle}>
            Koleksiyonlar yüklenirken bir hata oluştu. Lütfen tekrar deneyin.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => f.refetch()}>
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : f.collections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="albums-outline" size={64} color={colors.text.subtle} />
          <Text style={styles.emptyTitle}>Henüz Beğeni Yok</Text>
          <Text style={styles.emptySubtitle}>Beğendiğiniz koleksiyonlar burada görünecek</Text>
          <TouchableOpacity style={styles.browseButton} onPress={() => router.push('/collections')}>
            <Text style={styles.browseButtonText}>Koleksiyonları Keşfet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
        >
          <View style={styles.collectionsGrid}>
            {f.collections.map((collection) => (
              <LikedCollectionCard key={collection.id} collection={collection} f={f} />
            ))}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ ...f.snackbar, visible: false })}
        duration={2000}
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
