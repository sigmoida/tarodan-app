import { View, FlatList, RefreshControl } from 'react-native';
import { theme, Text, Button, Spinner, Snackbar, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFavoritesScreen } from './_hooks/useFavoritesScreen';
import { styles } from './_lib/styles';
import { FavoriteCard } from './_components/FavoriteCard';

const { colors } = theme;

export default function FavoritesScreen() {
  const f = useFavoritesScreen();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (!f.isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Favorilerim" onBack={back} />
        <View style={styles.centeredContainer}>
          <Ionicons name="heart-outline" size={64} color={colors.primary[600]!} />
          <Text variant="h2" style={styles.title}>Favorilerim</Text>
          <Text variant="body" style={styles.subtitle}>Favorilerinizi görmek için giriş yapın</Text>
          <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={styles.button} />
          <Button variant="ghost" title="Hesap Oluştur" onPress={() => router.push('/(auth)/register')} style={{ alignSelf: 'center' }} />
        </View>
      </View>
    );
  }

  if (f.isLoading && f.items.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Spinner size="lg" />
        <Text style={{ marginTop: theme.spacing[4] }}>Favoriler yükleniyor...</Text>
      </View>
    );
  }

  if (f.error && f.items.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.text.subtle} />
        <Text style={{ marginTop: theme.spacing[4], fontSize: 16, fontWeight: '600', color: colors.text.heading }}>Yüklenemedi</Text>
        <Text style={{ marginTop: theme.spacing[2], color: colors.text.subtle, textAlign: 'center' }}>Favorileriniz yüklenirken bir hata oluştu.</Text>
        <Button variant="primary" title="Tekrar Dene" onPress={() => f.fetchFavorites()} style={{ marginTop: theme.spacing[4], alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Favorilerim (${f.getFavoriteCount()})`} onBack={back} />

      {f.items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>Henüz favori yok</Text>
          <Text variant="body" style={styles.emptySubtitle}>
            Beğendiğiniz ürünleri favorilere ekleyerek kolayca takip edin
          </Text>
          <Button variant="primary" title="Ürünleri Keşfet" onPress={() => router.push('/(tabs)/search')} style={styles.browseButton} />
        </View>
      ) : (
        <FlatList
          data={f.items}
          keyExtractor={(item) => item.id}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} colors={[colors.primary[600]!]} />
          }
          ListFooterComponent={
            <>
              <View style={styles.recommendationsSection}>
                <Text variant="h3" style={styles.sectionTitle}>Beğenebileceğiniz</Text>
                <Button variant="outline" title="Daha Fazla Ürün Keşfet" style={{ alignSelf: 'center' }} onPress={() => router.push('/(tabs)/search')} />
              </View>
              <View style={{ height: 100 }} />
            </>
          }
          renderItem={({ item }) => <FavoriteCard item={item} f={f} />}
        />
      )}

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ ...f.snackbar, visible: false })}
        duration={2000}
        action={{ label: 'Sepete Git', onPress: () => router.push('/cart') }}
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
