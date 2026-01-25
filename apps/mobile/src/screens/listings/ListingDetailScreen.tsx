/**
 * Listing Detail Screen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useListingsStore } from '../../stores/listingsStore';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';

const { width } = Dimensions.get('window');

const ListingDetailScreen = ({ route, navigation }: any) => {
  const { id } = route.params;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const { currentListing: listing, fetchListing, isLoading, incrementView } = useListingsStore();
  const { addToCart, isLoading: cartLoading } = useCartStore();
  const { user } = useAuthStore();

  // Check if current user is the owner
  const isOwner = user?.id === listing?.seller?.id;

  useEffect(() => {
    fetchListing(id);
    
    // Only increment view count if not the owner
    if (!isOwner && user?.id !== listing?.seller?.id) {
      incrementView?.(id);
    }
  }, [id]);

  const handleAddToCart = async () => {
    try {
      await addToCart(id);
      Alert.alert('Başarılı', 'Ürün sepete eklendi');
    } catch (error) {
      Alert.alert('Hata', 'Sepete eklenemedi');
    }
  };

  const handleTrade = () => {
    navigation.navigate('InitiateTrade', { listingId: id });
  };

  const handleMessage = () => {
    navigation.navigate('Messages', {
      screen: 'Chat',
      params: { 
        userId: listing?.seller?.id,
        username: listing?.seller?.username,
        listingId: id
      }
    });
  };

  if (isLoading || !listing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  const images = listing.images?.length ? listing.images : ['https://via.placeholder.com/400'];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width);
              setActiveImageIndex(index);
            }}
            scrollEventThrottle={16}
          >
            {images.map((image: string, index: number) => (
              <Image
                key={index}
                source={{ uri: image }}
                style={styles.image}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          
          {/* Image Indicators */}
          {images.length > 1 && (
            <View style={styles.indicators}>
              {images.map((_: any, index: number) => (
                <View
                  key={index}
                  style={[
                    styles.indicator,
                    index === activeImageIndex && styles.indicatorActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Trade Badge */}
          {listing.trade_available && (
            <View style={styles.tradeBadge}>
              <Icon name="swap-horizontal" size={16} color="#FFF" />
              <Text style={styles.tradeBadgeText}>Takas Kabul Edilir</Text>
            </View>
          )}
        </View>

        {/* Listing Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>₺{listing.price?.toLocaleString('tr-TR')}</Text>

          {/* Quick Info */}
          <View style={styles.quickInfo}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Marka</Text>
              <Text style={styles.infoValue}>{listing.brand}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ölçek</Text>
              <Text style={styles.infoValue}>{listing.scale}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Yıl</Text>
              <Text style={styles.infoValue}>{listing.year || '-'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Durum</Text>
              <Text style={styles.infoValue}>{listing.condition}</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Açıklama</Text>
            <Text style={styles.description}>{listing.description}</Text>
          </View>

          {/* Seller Info */}
          <TouchableOpacity 
            style={styles.sellerCard}
            onPress={() => {/* Navigate to seller profile */}}
          >
            <View style={styles.sellerAvatar}>
              <Icon name="person" size={24} color="#757575" />
            </View>
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>{listing.seller?.username}</Text>
              <View style={styles.sellerRating}>
                <Icon name="star" size={14} color="#FFC107" />
                <Text style={styles.ratingText}>
                  {listing.seller?.rating?.toFixed(1) || '0.0'}
                </Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={24} color="#BDBDBD" />
          </TouchableOpacity>

          {/* Message Seller Button - Hide if owner */}
          {!isOwner && (
            <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
              <Icon name="chatbubble-outline" size={20} color="#E53935" />
              <Text style={styles.messageButtonText}>Satıcıya Mesaj Gönder</Text>
            </TouchableOpacity>
          )}

          {/* Owner Actions */}
          {isOwner && (
            <View style={styles.ownerActionsContainer}>
              <Text style={styles.ownerBadge}>
                <Icon name="person" size={14} color="#4CAF50" /> Bu sizin ilanınız
              </Text>
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => navigation.navigate('EditListing', { id })}
              >
                <Icon name="create-outline" size={20} color="#2196F3" />
                <Text style={styles.editButtonText}>İlanı Düzenle</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Action Bar - Hide for owner */}
      {!isOwner && (
        <View style={styles.actionBar}>
          {listing.trade_available && (
            <TouchableOpacity 
              style={styles.tradeButton}
              onPress={handleTrade}
            >
              <Icon name="swap-horizontal" size={22} color="#4CAF50" />
              <Text style={styles.tradeButtonText}>Takas Teklifi</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.buyButton, !listing.trade_available && { flex: 1 }]}
            onPress={handleAddToCart}
            disabled={cartLoading}
          >
            {cartLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Icon name="cart" size={22} color="#FFF" />
                <Text style={styles.buyButtonText}>Sepete Ekle</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width,
    height: width,
    backgroundColor: '#F5F5F5',
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 4,
  },
  indicatorActive: {
    backgroundColor: '#FFF',
    width: 24,
  },
  tradeBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tradeBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  infoContainer: {
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: '#E53935',
    marginBottom: 16,
  },
  quickInfo: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 22,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  sellerRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 4,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E53935',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 100,
  },
  messageButtonText: {
    color: '#E53935',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  ownerActionsContainer: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  ownerBadge: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
  },
  editButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    gap: 12,
  },
  tradeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 14,
  },
  tradeButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E53935',
    borderRadius: 12,
    paddingVertical: 14,
  },
  buyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default ListingDetailScreen;


