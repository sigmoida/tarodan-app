import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Avatar, Button, List, Divider, Card, Badge, Snackbar } from 'react-native-paper';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { userApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';
import { SignupPrompt } from '../../src/components/SignupPrompt';
import { getRestrictionMessage, GuestAction } from '../../src/utils/guestRestrictions';

export default function ProfileScreen() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<'favorites' | 'message' | 'purchase' | 'trade' | 'collections'>('favorites');

  // Web ile aynı endpoint: GET /users/me/stats
  const { data: apiStats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      try {
        const response = await userApi.getStats();
        return response.data?.data || response.data;
      } catch (error) {
        console.log('Stats API failed, using user data');
        return null;
      }
    },
    enabled: isAuthenticated,
    retry: 1,
  });

  // Use API stats or fall back to user data from authStore
  const stats = apiStats || { 
    listings: user?.listingCount || 0, 
    trades: user?.totalSales || 0, 
    rating: user?.rating || 0, 
    collections: 0, 
    favorites: 0, 
    orders: user?.totalPurchases || 0 
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const handleGuestAction = (action: GuestAction) => {
    const config = getRestrictionMessage(action);
    setSnackbarMessage(config.message);
    setSnackbarVisible(true);
    
    if (action === 'favorites' || action === 'wishlist') {
      setPromptType('favorites');
    } else if (action === 'message') {
      setPromptType('message');
    } else if (action === 'trade') {
      setPromptType('trade');
    } else if (action === 'collections') {
      setPromptType('collections');
    }
    
    setTimeout(() => {
      setShowPrompt(true);
    }, 500);
  };

  // Guest View
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profil</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Guest Welcome Card */}
          <View style={styles.guestWelcome}>
            <Avatar.Icon 
              size={80} 
              icon="account-outline" 
              style={{ backgroundColor: TarodanColors.primaryLight }}
              color={TarodanColors.primary}
            />
            <Text style={styles.guestTitle}>Hoş Geldiniz!</Text>
            <Text style={styles.guestSubtitle}>
              Tarodan'a giriş yaparak tüm özelliklerden yararlanın
            </Text>
            <Button 
              mode="contained" 
              onPress={() => router.push('/(auth)/login')} 
              style={styles.loginButton}
              buttonColor={TarodanColors.primary}
              icon="login"
            >
              Giriş Yap
            </Button>
            <Button 
              mode="outlined" 
              onPress={() => router.push('/(auth)/register')} 
              style={styles.registerButton}
              textColor={TarodanColors.primary}
            >
              Ücretsiz Üye Ol
            </Button>
          </View>

          {/* Guest Benefits */}
          <View style={styles.benefitsSection}>
            <Text style={styles.benefitsTitle}>Üye Olarak Neler Yapabilirsiniz?</Text>
            
            <View style={styles.benefitCard}>
              <View style={[styles.benefitIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="pricetag" size={24} color="#4CAF50" />
              </View>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>İlan Yayınlayın</Text>
                <Text style={styles.benefitDescription}>
                  Koleksiyonunuzdaki modelleri satışa çıkarın veya takasa açın
                </Text>
              </View>
            </View>

            <View style={styles.benefitCard}>
              <View style={[styles.benefitIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="swap-horizontal" size={24} color="#2196F3" />
              </View>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>Takas Yapın</Text>
                <Text style={styles.benefitDescription}>
                  Diğer koleksiyonerlerle model değişimi yapın
                </Text>
              </View>
            </View>

            <View style={styles.benefitCard}>
              <View style={[styles.benefitIcon, { backgroundColor: '#FCE4EC' }]}>
                <Ionicons name="heart" size={24} color="#E91E63" />
              </View>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>Favorilere Kaydedin</Text>
                <Text style={styles.benefitDescription}>
                  Beğendiğiniz ürünleri kaydedin, fiyat değişikliklerinden haberdar olun
                </Text>
              </View>
            </View>

            <View style={styles.benefitCard}>
              <View style={[styles.benefitIcon, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="car-sport" size={24} color="#FF9800" />
              </View>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>Digital Garage</Text>
                <Text style={styles.benefitDescription}>
                  Koleksiyonunuzu sergileyin ve diğerleriyle paylaşın
                </Text>
              </View>
            </View>
          </View>

          {/* Guest Quick Links */}
          <View style={styles.quickLinksSection}>
            <Text style={styles.quickLinksTitle}>Şimdilik Şunları Yapabilirsiniz</Text>
            
            <TouchableOpacity 
              style={styles.quickLinkItem}
              onPress={() => router.push('/search')}
            >
              <Ionicons name="search-outline" size={22} color={TarodanColors.primary} />
              <Text style={styles.quickLinkText}>İlanlara Göz At</Text>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickLinkItem}
              onPress={() => router.push('/collections')}
            >
              <Ionicons name="albums-outline" size={22} color={TarodanColors.primary} />
              <Text style={styles.quickLinkText}>Koleksiyonları Keşfet</Text>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickLinkItem}
              onPress={() => router.push('/cart')}
            >
              <Ionicons name="cart-outline" size={22} color={TarodanColors.primary} />
              <Text style={styles.quickLinkText}>Sepetim</Text>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickLinkItem}
              onPress={() => router.push('/order-track')}
            >
              <Ionicons name="location-outline" size={22} color={TarodanColors.primary} />
              <Text style={styles.quickLinkText}>Sipariş Takip</Text>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickLinkItem}
              onPress={() => router.push('/help')}
            >
              <Ionicons name="help-circle-outline" size={22} color={TarodanColors.primary} />
              <Text style={styles.quickLinkText}>Yardım Merkezi</Text>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>
          </View>

          {/* Premium Promo */}
          <View style={styles.premiumPromo}>
            <View style={styles.premiumHeader}>
              <Ionicons name="diamond" size={32} color={TarodanColors.star} />
              <Text style={styles.premiumTitle}>Premium Üyelik</Text>
            </View>
            <Text style={styles.premiumDescription}>
              Sınırsız ilan, takas özelliği, Digital Garage ve daha fazlası için Premium üye olun!
            </Text>
            <View style={styles.premiumPrice}>
              <Text style={styles.premiumPriceLabel}>Aylık sadece</Text>
              <Text style={styles.premiumPriceValue}>₺99</Text>
            </View>
            <Button 
              mode="contained" 
              onPress={() => router.push('/(auth)/register')}
              buttonColor={TarodanColors.star}
              style={styles.premiumButton}
              icon="crown"
            >
              Premium Ol
            </Button>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={2000}
        >
          {snackbarMessage}
        </Snackbar>

        <SignupPrompt
          visible={showPrompt}
          onDismiss={() => setShowPrompt(false)}
          type={promptType}
        />
      </View>
    );
  }

  // Authenticated User View
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profil</Text>
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Avatar.Text 
            size={72} 
            label={user?.displayName?.substring(0, 2).toUpperCase() || 'U'} 
            style={{ backgroundColor: TarodanColors.primaryLight }}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            {user?.membershipTier && (
              <View style={styles.membershipBadge}>
                <Ionicons name="diamond" size={14} color={TarodanColors.star} />
                <Text style={styles.membershipText}>{user.membershipTier} Üye</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.editButton} onPress={() => router.push('/settings/edit-profile')}>
            <Ionicons name="pencil" size={18} color={TarodanColors.primary} />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <TouchableOpacity style={styles.statItem} onPress={() => router.push('/settings/my-listings')}>
            <Text style={styles.statNumber}>{stats?.listings || 0}</Text>
            <Text style={styles.statLabel}>İlanlarım</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem} onPress={() => router.push('/trades')}>
            <Text style={styles.statNumber}>{stats?.trades || 0}</Text>
            <Text style={styles.statLabel}>Takaslar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem} onPress={() => router.push('/settings/collections')}>
            <Text style={styles.statNumber}>{stats?.collections || 0}</Text>
            <Text style={styles.statLabel}>Koleksiyon</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color={TarodanColors.star} />
              <Text style={styles.statNumber}>{stats?.rating || '-'}</Text>
            </View>
            <Text style={styles.statLabel}>Puan</Text>
          </TouchableOpacity>
        </View>

        {/* Digital Garage Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="car-sport" size={20} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>Dijital Garajım</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/settings/collections')}>
              <Text style={styles.seeAllText}>Tümünü gör</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.garageCard} onPress={() => router.push('/settings/collections')}>
            <View style={styles.garageIconContainer}>
              <Ionicons name="add-circle" size={40} color={TarodanColors.primary} />
            </View>
            <Text style={styles.garageText}>Koleksiyon Oluştur</Text>
            <Text style={styles.garageSubtext}>Araçlarını sergile ve paylaş</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hızlı Erişim</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/settings/my-listings')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="pricetag" size={22} color="#4CAF50" />
              </View>
              <Text style={styles.quickActionText}>İlanlarım</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/orders')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="cube" size={22} color="#2196F3" />
              </View>
              <Text style={styles.quickActionText}>Siparişlerim</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/favorites')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#FCE4EC' }]}>
                <Ionicons name="heart" size={22} color="#E91E63" />
              </View>
              <Text style={styles.quickActionText}>Favorilerim</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/messages')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="chatbubbles" size={22} color="#FF9800" />
              </View>
              <Text style={styles.quickActionText}>Mesajlar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Hesap Ayarları</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/addresses')}>
            <Ionicons name="location-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>Adreslerim</Text>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/membership')}>
            <Ionicons name="diamond-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>Üyelik Planı</Text>
            {user?.membershipTier === 'Premium' && <Badge style={{ backgroundColor: TarodanColors.primary }}>PRO</Badge>}
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/notifications')}>
            <Ionicons name="notifications-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>Bildirim Ayarları</Text>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/security')}>
            <Ionicons name="shield-checkmark-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>Güvenlik</Text>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>

          {/* Business Panel - Web ile aynı */}
          {user?.membershipTier?.toLowerCase() === 'business' && (
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/business')}>
              <Ionicons name="business-outline" size={22} color={TarodanColors.primary} />
              <Text style={[styles.menuItemText, { color: TarodanColors.primary }]}>İşletme Paneli</Text>
              <Badge style={{ backgroundColor: '#FFA500', marginLeft: 8 }}>👑</Badge>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/analytics')}>
            <Ionicons name="stats-chart-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>İstatistikler</Text>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Destek</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/help')}>
            <Ionicons name="help-circle-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>Yardım & SSS</Text>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/support')}>
            <Ionicons name="headset-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>Destek Talebi</Text>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/help')}>
            <Ionicons name="information-circle-outline" size={22} color={TarodanColors.textSecondary} />
            <Text style={styles.menuItemText}>Hakkında</Text>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color={TarodanColors.error} />
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  scrollView: {
    flex: 1,
  },
  // Guest styles
  guestWelcome: {
    backgroundColor: TarodanColors.background,
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  guestTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  guestSubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  loginButton: {
    width: '100%',
    borderRadius: 12,
    marginBottom: 12,
  },
  registerButton: {
    width: '100%',
    borderRadius: 12,
  },
  benefitsSection: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  benefitCard: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
    marginLeft: 12,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  benefitDescription: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  quickLinksSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  quickLinksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
    marginBottom: 12,
  },
  quickLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  quickLinkText: {
    flex: 1,
    fontSize: 15,
    color: TarodanColors.textPrimary,
    marginLeft: 12,
  },
  premiumPromo: {
    margin: 16,
    padding: 24,
    backgroundColor: TarodanColors.secondary,
    borderRadius: 16,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  premiumTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
    marginLeft: 12,
  },
  premiumDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
    marginBottom: 16,
  },
  premiumPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  premiumPriceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginRight: 8,
  },
  premiumPriceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: TarodanColors.star,
  },
  premiumButton: {
    borderRadius: 12,
  },
  // Authenticated styles
  profileCard: {
    backgroundColor: TarodanColors.background,
    margin: 16,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  profileEmail: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  membershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  membershipText: {
    fontSize: 12,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginLeft: 4,
  },
  editButton: {
    padding: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: TarodanColors.background,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginLeft: 8,
  },
  seeAllText: {
    fontSize: 14,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  garageCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: TarodanColors.border,
    borderStyle: 'dashed',
  },
  garageIconContainer: {
    marginBottom: 12,
  },
  garageText: {
    fontSize: 16,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  garageSubtext: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  quickAction: {
    alignItems: 'center',
    flex: 1,
  },
  quickActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  menuSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  menuSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  menuItem: {
    backgroundColor: TarodanColors.background,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    color: TarodanColors.textPrimary,
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: TarodanColors.background,
    borderWidth: 1,
    borderColor: TarodanColors.error,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: TarodanColors.error,
    marginLeft: 8,
  },
});
