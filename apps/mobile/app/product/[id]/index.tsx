import { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Spinner, Divider, Snackbar, Text, theme, EmptyState } from '@tarodan/ui-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedRefreshControl } from '@/components/common';
import { useRefresh } from '@/hooks/useRefresh';
import { useAuthStore } from '@/stores/authStore';
import { SignupPrompt } from '@/components/SignupPrompt';
import MakeOfferModal from '@/components/product/MakeOfferModal';
import AddToCollectionModal from '@/components/product/AddToCollectionModal';
import { resolveProductImages, isProductOutOfStock, getProductPriceInfo } from './_lib/display';
import { useProduct } from './_hooks/useProduct';
import { useProductReviews } from './_hooks/useProductReviews';
import { useProductFavorite } from './_hooks/useProductFavorite';
import { useGuestPrompt } from './_hooks/useGuestPrompt';
import { useProductActions } from './_hooks/useProductActions';
import { ProductTopBar } from './_components/ProductTopBar';
import { ProductGallery } from './_components/ProductGallery';
import { ProductInfo } from './_components/ProductInfo';
import { SellerCard } from './_components/SellerCard';
import { ProductReviewsPreview } from './_components/ProductReviewsPreview';
import { ProductBottomBar } from './_components/ProductBottomBar';
import { ImageViewerModal } from './_modals/ImageViewerModal';

const { colors } = theme;

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const productId = String(id);
  const { isAuthenticated, user } = useAuthStore();

  const { data: product, isLoading, refetch: refetchProduct } = useProduct(productId, isAuthenticated);
  const { data: reviews, refetch: refetchReviews } = useProductReviews(productId, !!id);
  const { refreshing, onRefresh } = useRefresh(refetchProduct, refetchReviews);
  const guest = useGuestPrompt(productId, isAuthenticated);

  const [currentImage, setCurrentImage] = useState(0);
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  const images = product ? resolveProductImages(product) : [];
  const isOutOfStock = product ? isProductOutOfStock(product) : false;

  const actions = useProductActions({ product, productId, images, isOutOfStock, isAuthenticated, user });
  const favorite = useProductFavorite({ product, productId, isAuthenticated, notify: actions.notify });

  // Tüm hook'lar tamamlandı — buradan sonra erken çıkış güvenli.
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }
  if (!product) {
    return (
      <EmptyState
        fullscreen
        icon="cube-outline"
        title="Ürün bulunamadı"
        actionLabel="Geri Dön"
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
    );
  }

  const isOwner = Boolean(
    isAuthenticated && user?.id && product.seller?.id && user.id === product.seller.id,
  );
  const price = getProductPriceInfo(product);
  const openReviews = () => router.push(`/product/${productId}/reviews`);

  return (
    <View style={styles.container}>
      <ProductTopBar
        isFavorite={favorite.isFavorite}
        favoriteLoading={favorite.favoriteLoading}
        onBack={() => router.back()}
        onReport={actions.handleReport}
        onShare={actions.handleShare}
        onFavorite={favorite.toggle}
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ProductGallery
          images={images}
          currentImage={currentImage}
          onPageChange={setCurrentImage}
          onOpenViewer={(index) => setViewer({ open: true, index })}
        />

        <View style={styles.mainContent}>
          <ProductInfo
            product={product}
            isOwner={isOwner}
            favoriteCount={favorite.favoriteCount}
            price={price}
            onOpenReviews={openReviews}
            actions={{
              onTrade: actions.handleTrade,
              onMakeOffer: actions.handleMakeOffer,
              onAddToCollection: actions.handleAddToCollection,
              onMessage: actions.handleMessage,
              onShare: actions.handleShare,
            }}
          />

          <SellerCard
            seller={product.seller}
            onPressSeller={() => router.push(`/seller/${product.seller?.id}`)}
            onMessage={actions.handleMessage}
          />

          <Divider style={styles.divider} />

          <ProductReviewsPreview reviews={reviews} onSeeAll={openReviews} />

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Ionicons name="shield-checkmark" size={24} color={colors.success[500]!} />
            <View style={styles.securityContent}>
              <Text style={styles.securityTitle}>Güvenli Alışveriş</Text>
              <Text style={styles.securityText}>Ödemeniz, ürün elinize ulaşana kadar güvende tutulur.</Text>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      <ProductBottomBar
        product={product}
        isOwner={isOwner}
        isOutOfStock={isOutOfStock}
        price={price}
        inCart={actions.inCart}
        onEdit={() => router.push(`/listing/${product.id}/edit` as any)}
        onTrade={actions.handleTrade}
        onBuyNow={actions.handleBuyNow}
        onAddToCart={actions.handleAddToCart}
        onGoToCart={() => router.push('/cart')}
      />

      <ImageViewerModal
        visible={viewer.open}
        images={images}
        initialIndex={viewer.index}
        onClose={() => setViewer((v) => ({ ...v, open: false }))}
      />

      <Snackbar
        visible={actions.snackbar.visible}
        onDismiss={actions.dismissSnackbar}
        duration={2000}
        variant={actions.snackbar.type === 'success' ? 'success' : 'danger'}
        action={
          actions.snackbar.type === 'success' && actions.snackbar.message.includes('sepet')
            ? { label: 'Sepete Git', onPress: () => router.push('/cart') }
            : undefined
        }
      >
        {actions.snackbar.message}
      </Snackbar>

      {guest.promptType && (
        <SignupPrompt visible={guest.showPrompt} onDismiss={guest.dismissPrompt} type={guest.promptType} />
      )}

      <MakeOfferModal
        visible={actions.offerModalOpen}
        onDismiss={() => actions.setOfferModalOpen(false)}
        productId={productId}
        productTitle={product.title}
        listPrice={product.price ?? 0}
        onSuccess={() => {
          actions.setOfferModalOpen(false);
          actions.notify('Teklifiniz gönderildi', 'success');
        }}
      />

      <AddToCollectionModal
        visible={actions.collectionModalOpen}
        onDismiss={() => actions.setCollectionModalOpen(false)}
        productId={productId}
        onSuccess={(collectionName: string) => {
          actions.setCollectionModalOpen(false);
          actions.notify(`"${collectionName}" koleksiyonuna eklendi`, 'success');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white },
  loadingText: { marginTop: theme.spacing[4], color: colors.text.muted },
  content: { flex: 1 },
  mainContent: { padding: theme.spacing[4] },
  divider: { marginVertical: theme.spacing[4] },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: colors.success[50]!,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
  },
  securityContent: { flex: 1, marginLeft: theme.spacing[3] },
  securityTitle: { fontSize: 14, fontWeight: '600', color: colors.success[600]! },
  securityText: { fontSize: 13, color: colors.success[700]!, marginTop: theme.spacing[0.5] },
});
