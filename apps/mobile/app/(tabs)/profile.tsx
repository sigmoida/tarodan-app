import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar,
  Badge,
  Button,
  Snackbar,
  Text,
  theme,
} from '@tarodan/ui-native';
import { userApi, notificationsApi, collectionsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { SignupPrompt } from '../../src/components/SignupPrompt';
import { getRestrictionMessage, GuestAction } from '../../src/utils/guestRestrictions';

const { colors, spacing, radius } = theme;

const benefitTints = [
  { bg: colors.success[50]!, fg: colors.success[600]! },
  { bg: colors.info[50]!, fg: colors.info[600]! },
  { bg: colors.danger[50]!, fg: colors.danger[600]! },
  { bg: colors.warning[50]!, fg: colors.warning[600]! },
] as const;

const quickActionTints = [
  { bg: colors.success[50]!, fg: colors.success[600]! },
  { bg: colors.info[50]!, fg: colors.info[600]! },
  { bg: colors.danger[50]!, fg: colors.danger[600]! },
  { bg: colors.warning[50]!, fg: colors.warning[600]! },
  { bg: colors.primary[50]!, fg: colors.primary[700]! },
  { bg: colors.warning[100]!, fg: colors.warning[700]! },
  { bg: colors.info[100]!, fg: colors.info[700]! },
  { bg: colors.success[100]!, fg: colors.success[700]! },
  { bg: colors.gray[100], fg: colors.gray[700]! },
] as const;

export default function ProfileScreen() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<
    'favorites' | 'message' | 'purchase' | 'trade' | 'collections'
  >('favorites');

  // Web ile parite: sayaçlar kullanıcının kendi public profilinin stats objesinden
  // ({ totalListings, totalSales, totalTrades, averageRating, totalRatings }).
  // (business-stats yalnızca business tier'da çalışıyordu → premium/free'de boştu.)
  const { data: apiStats } = useQuery({
    queryKey: ['user-stats', user?.id],
    queryFn: async () => {
      try {
        const response = await userApi.getPublicProfile(String(user?.id));
        return (response.data as any)?.data?.stats ?? (response.data as any)?.stats ?? null;
      } catch (error) {
        console.log('Stats API failed, using user data');
        return null;
      }
    },
    enabled: isAuthenticated && !!user?.id,
    retry: 1,
  });

  // Koleksiyon sayısı business-stats'ta gelmeyebilir; web gibi /collections/me
  // üzerinden ayrı çekilir (meta.total).
  const { data: collectionsCount } = useQuery({
    queryKey: ['user-collections-count'],
    queryFn: async () => {
      try {
        const res = await collectionsApi.getMyCollections({ limit: 1 });
        const body = res.data as
          | { meta?: { total?: number }; data?: unknown[]; total?: number }
          | unknown[]
          | undefined;
        if (Array.isArray(body)) return body.length;
        return (
          body?.meta?.total ??
          body?.total ??
          (Array.isArray(body?.data) ? body!.data!.length : 0)
        );
      } catch {
        return 0;
      }
    },
    enabled: isAuthenticated,
    retry: 1,
  });

  const apiStatsObj = (apiStats as Record<string, number> | null) || null;
  const stats = {
    listings: apiStatsObj?.totalListings ?? (user as any)?.listingCount ?? 0,
    trades: apiStatsObj?.totalTrades ?? 0,
    rating: apiStatsObj?.averageRating ?? (user as any)?.rating ?? 0,
    collections: collectionsCount ?? 0,
    favorites: apiStatsObj?.favorites ?? 0,
    orders: apiStatsObj?.orders ?? user?.totalPurchases ?? 0,
  };

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      try {
        const response = await notificationsApi.getUnreadCount();
        const body = response.data as
          | { count?: number; data?: { count?: number } }
          | undefined;
        return body?.count ?? body?.data?.count ?? 0;
      } catch {
        return 0;
      }
    },
    enabled: isAuthenticated,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const unreadNotifications: number = typeof unreadData === 'number' ? unreadData : 0;

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleGuestAction = (action: GuestAction) => {
    const config = getRestrictionMessage(action);
    setSnackbarMessage(config.message);
    setSnackbarVisible(true);

    if (action === 'favorites' || action === 'wishlist') setPromptType('favorites');
    else if (action === 'message') setPromptType('message');
    else if (action === 'trade') setPromptType('trade');
    else if (action === 'collections') setPromptType('collections');

    setTimeout(() => setShowPrompt(true), 500);
  };

  // Guest View
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="h3" tone="inverted" weight="bold">
            Profil
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.guestWelcome}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: radius.full,
                backgroundColor: colors.primary[50]!,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="person-outline" size={48} color={colors.primary[600]!} />
            </View>
            <Text variant="h1" align="center" style={{ marginTop: spacing[4] }}>
              Hoş Geldiniz!
            </Text>
            <Text
              variant="body"
              tone="muted"
              align="center"
              style={{ marginTop: spacing[2], marginBottom: spacing[5] }}
            >
              Tarodan'a giriş yaparak tüm özelliklerden yararlanın
            </Text>
            <Button
              testID="profile-go-login-button"
              variant="primary"
              size="lg"
              fullWidth
              icon="log-in-outline"
              title="Giriş Yap"
              onPress={() => router.push('/(auth)/login')}
              style={styles.loginButton}
            />
            <Button
              variant="outline"
              size="lg"
              fullWidth
              title="Ücretsiz Üye Ol"
              onPress={() => router.push('/(auth)/register')}
              style={styles.registerButton}
            />
          </View>

          <View style={styles.benefitsSection}>
            <Text variant="h3" style={{ marginBottom: spacing[4] }}>
              Üye Olarak Neler Yapabilirsiniz?
            </Text>

            {[
              {
                icon: 'pricetag' as const,
                title: 'İlan Yayınlayın',
                desc: 'Koleksiyonunuzdaki modelleri satışa çıkarın veya takasa açın',
                tint: benefitTints[0],
              },
              {
                icon: 'swap-horizontal' as const,
                title: 'Takas Yapın',
                desc: 'Diğer koleksiyonerlerle model değişimi yapın',
                tint: benefitTints[1],
              },
              {
                icon: 'heart' as const,
                title: 'Favorilere Kaydedin',
                desc: 'Beğendiğiniz ürünleri kaydedin, fiyat değişikliklerinden haberdar olun',
                tint: benefitTints[2],
              },
              {
                icon: 'car-sport' as const,
                title: 'Digital Garage',
                desc: 'Koleksiyonunuzu sergileyin ve diğerleriyle paylaşın',
                tint: benefitTints[3],
              },
            ].map((b) => (
              <View key={b.title} style={styles.benefitCard}>
                <View style={[styles.benefitIcon, { backgroundColor: b.tint.bg }]}>
                  <Ionicons name={b.icon} size={24} color={b.tint.fg} />
                </View>
                <View style={styles.benefitContent}>
                  <Text variant="label">{b.title}</Text>
                  <Text variant="bodySm" tone="muted" style={{ marginTop: spacing[1] }}>
                    {b.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.quickLinksSection}>
            <Text variant="label" tone="muted" style={{ marginBottom: spacing[3] }}>
              Şimdilik Şunları Yapabilirsiniz
            </Text>

            {[
              { icon: 'search-outline' as const, label: 'İlanlara Göz At', to: '/search' },
              { icon: 'albums-outline' as const, label: 'Koleksiyonları Keşfet', to: '/collections' },
              { icon: 'cart-outline' as const, label: 'Sepetim', to: '/cart' },
              { icon: 'location-outline' as const, label: 'Sipariş Takip', to: '/order-track' },
              { icon: 'help-circle-outline' as const, label: 'Yardım Merkezi', to: '/help' },
            ].map((q) => (
              <TouchableOpacity
                key={q.label}
                style={styles.quickLinkItem}
                onPress={() => router.push(q.to as never)}
              >
                <Ionicons name={q.icon} size={22} color={colors.primary[600]!} />
                <Text variant="body" style={styles.quickLinkText}>
                  {q.label}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.premiumPromo}>
            <View style={styles.premiumHeader}>
              <Ionicons name="diamond" size={32} color={colors.warning[500]!} />
              <Text variant="h2" tone="inverted" style={{ marginLeft: spacing[3] }}>
                Premium Üyelik
              </Text>
            </View>
            <Text
              variant="body"
              color={colors.white}
              style={{ marginBottom: spacing[4], opacity: 0.85 }}
            >
              Sınırsız ilan, takas özelliği, Digital Garage ve daha fazlası için Premium üye olun!
            </Text>
            <View style={styles.premiumPrice}>
              <Text variant="bodySm" color={colors.white} style={{ opacity: 0.7, marginRight: spacing[2] }}>
                Aylık sadece
              </Text>
              <Text variant="displaySm" color={colors.warning[500]!} weight="bold">
                ₺99
              </Text>
            </View>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              title="Premium Ol"
              onPress={() => router.push('/(auth)/register')}
              style={{ backgroundColor: colors.warning[500]! }}
            />
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

  // Authenticated View
  const quickActionItems = [
    { icon: 'pricetag' as const, label: 'İlanlarım', to: '/settings/my-listings', tint: quickActionTints[0] },
    { icon: 'cube' as const, label: 'Siparişlerim', to: '/orders', tint: quickActionTints[1], testID: 'profile-orders-link' },
    { icon: 'heart' as const, label: 'Favorilerim', to: '/favorites', tint: quickActionTints[2] },
    { icon: 'chatbubbles' as const, label: 'Mesajlar', to: '/messages', tint: quickActionTints[3] },
  ];

  const quickActionItems2 = [
    { icon: 'albums' as const, label: 'Beğenilen\nKoleksiyonlar', to: '/settings/liked-collections', tint: quickActionTints[4] },
    { icon: 'swap-horizontal' as const, label: 'Takaslarım', to: '/trades', tint: quickActionTints[5], testID: 'profile-trades-link' },
    { icon: 'pricetags' as const, label: 'Tekliflerim', to: '/offers', tint: quickActionTints[6], testID: 'profile-offers-link' },
    { icon: 'stats-chart' as const, label: 'İstatistikler', to: '/settings/analytics', tint: quickActionTints[7] },
    { icon: 'help-circle' as const, label: 'Yardım', to: '/help', tint: quickActionTints[8] },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h3" tone="inverted" weight="bold">
          Profil
        </Text>
        <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.bellWrap}>
          <Ionicons name="notifications-outline" size={24} color={colors.text.inverted} />
          {unreadNotifications > 0 && (
            <View style={styles.bellBadge}>
              <Text variant="caption" color={colors.white} weight="bold">
                {unreadNotifications > 99 ? '99+' : String(unreadNotifications)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <Avatar size="lg" name={user?.displayName || 'U'} />
          <View style={styles.profileInfo}>
            <Text variant="h3">{user?.displayName}</Text>
            <Text variant="bodySm" tone="muted" style={{ marginTop: 2 }}>
              {user?.email}
            </Text>
            {user?.membershipTier && (
              <View style={styles.membershipBadge}>
                <Ionicons name="diamond" size={14} color={colors.warning[500]!} />
                <Text variant="caption" weight="semibold" style={{ marginLeft: spacing[1] }}>
                  {user.membershipTier} Üye
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push('/settings/edit-profile')}
          >
            <Ionicons name="pencil" size={18} color={colors.primary[600]!} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => router.push('/settings/my-listings')}
          >
            <Text variant="h2" tone="primary">
              {stats?.listings || 0}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
              İlanlarım
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem} onPress={() => router.push('/trades')}>
            <Text variant="h2" tone="primary">
              {stats?.trades || 0}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
              Takaslar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => router.push('/settings/collections')}
          >
            <Text variant="h2" tone="primary">
              {stats?.collections || 0}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
              Koleksiyon
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color={colors.warning[500]!} />
              <Text variant="h2" tone="primary" style={{ marginLeft: 4 }}>
                {stats?.rating || '-'}
              </Text>
            </View>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
              Puan
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="car-sport" size={20} color={colors.primary[600]!} />
              <Text variant="h3" style={{ marginLeft: spacing[2] }}>
                Dijital Garajım
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/settings/collections')}>
              <Text variant="bodySm" tone="primary" weight="medium">
                Tümünü gör
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.garageCard}
            onPress={() => router.push('/settings/collections')}
          >
            <Ionicons name="add-circle" size={40} color={colors.primary[600]!} />
            <Text variant="h3" style={{ marginTop: spacing[3] }}>
              Koleksiyon Oluştur
            </Text>
            <Text variant="bodySm" tone="muted" style={{ marginTop: spacing[1] }}>
              Araçlarını sergile ve paylaş
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text variant="h3">Hızlı Erişim</Text>
          <View style={styles.quickActions}>
            {quickActionItems.map((q) => (
              <TouchableOpacity
                key={q.label}
                testID={q.testID}
                style={styles.quickAction}
                onPress={() => router.push(q.to as never)}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: q.tint.bg }]}>
                  <Ionicons name={q.icon} size={22} color={q.tint.fg} />
                </View>
                <Text variant="caption" tone="muted" align="center">
                  {q.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.quickActions, { marginTop: spacing[3] }]}>
            {quickActionItems2.map((q) => (
              <TouchableOpacity
                key={q.label}
                testID={q.testID}
                style={styles.quickAction}
                onPress={() => router.push(q.to as never)}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: q.tint.bg }]}>
                  <Ionicons name={q.icon} size={22} color={q.tint.fg} />
                </View>
                <Text variant="caption" tone="muted" align="center">
                  {q.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text variant="overline" tone="muted" style={{ marginBottom: spacing[3] }}>
            Hesap Ayarları
          </Text>

          <MenuItem
            icon="location-outline"
            label="Adreslerim"
            onPress={() => router.push('/settings/addresses')}
          />
          <MenuItem
            testID="profile-membership-link"
            icon="diamond-outline"
            label="Üyelik Planı"
            onPress={() => router.push('/membership')}
            rightSlot={
              user?.membershipTier === 'premium' || user?.membershipTier === 'business' ? (
                <Badge variant="primary">PRO</Badge>
              ) : null
            }
          />
          <MenuItem
            icon="notifications-outline"
            label="Bildirim Ayarları"
            onPress={() => router.push('/settings/notifications')}
          />
          <MenuItem
            icon="shield-checkmark-outline"
            label="Güvenlik"
            onPress={() => router.push('/settings/security')}
          />
          {user?.membershipTier?.toLowerCase() === 'business' && (
            <MenuItem
              icon="business-outline"
              label="İşletme Paneli"
              tone="primary"
              onPress={() => router.push('/settings/business')}
              rightSlot={<Badge variant="warning">👑</Badge>}
            />
          )}
          <MenuItem
            icon="stats-chart-outline"
            label="İstatistikler"
            onPress={() => router.push('/settings/analytics')}
          />
        </View>

        <View style={styles.menuSection}>
          <Text variant="overline" tone="muted" style={{ marginBottom: spacing[3] }}>
            Destek
          </Text>
          <MenuItem
            icon="help-circle-outline"
            label="Yardım & SSS"
            onPress={() => router.push('/help')}
          />
          <MenuItem
            icon="headset-outline"
            label="Destek Talebi"
            onPress={() => router.push('/support')}
          />
          <MenuItem
            icon="information-circle-outline"
            label="Hakkında"
            onPress={() => router.push('/help')}
          />
        </View>

        <TouchableOpacity
          testID="profile-logout-button"
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.danger[600]!} />
          <Text variant="body" tone="danger" weight="semibold" style={{ marginLeft: spacing[2] }}>
            Çıkış Yap
          </Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

interface MenuItemProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  tone?: 'default' | 'primary';
  rightSlot?: React.ReactNode;
  testID?: string;
}

function MenuItem({ icon, label, onPress, tone = 'default', rightSlot, testID }: MenuItemProps) {
  const labelTone = tone === 'primary' ? 'primary' : 'heading';
  const iconColor = tone === 'primary' ? colors.primary[600]! : colors.text.muted;
  return (
    <TouchableOpacity testID={testID} style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text variant="body" tone={labelTone} style={styles.menuItemText}>
        {label}
      </Text>
      {rightSlot}
      <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bellWrap: {
    position: 'relative',
    padding: 4,
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger[600]!,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary[600]!,
  },
  scrollView: { flex: 1 },
  guestWelcome: {
    backgroundColor: colors.surface.DEFAULT,
    margin: spacing[4],
    padding: spacing[6],
    borderRadius: radius['3xl'],
    alignItems: 'center',
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loginButton: { width: '100%', marginBottom: spacing[3] },
  registerButton: { width: '100%' },
  benefitsSection: {
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
  },
  benefitCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: radius['2xl'],
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
    marginLeft: spacing[3],
  },
  quickLinksSection: {
    marginTop: spacing[6],
    paddingHorizontal: spacing[4],
  },
  quickLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    padding: spacing[4],
    borderRadius: radius['2xl'],
    marginBottom: spacing[2],
  },
  quickLinkText: {
    flex: 1,
    marginLeft: spacing[3],
  },
  premiumPromo: {
    margin: spacing[4],
    padding: spacing[6],
    backgroundColor: colors.gray[800],
    borderRadius: radius['3xl'],
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  premiumPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing[4],
  },
  profileCard: {
    backgroundColor: colors.surface.DEFAULT,
    margin: spacing[4],
    padding: spacing[5],
    borderRadius: radius['3xl'],
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing[4],
  },
  membershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.alt,
    paddingHorizontal: spacing[2.5],
    paddingVertical: spacing[1],
    borderRadius: radius['2xl'],
    marginTop: spacing[2],
    alignSelf: 'flex-start',
  },
  editButton: { padding: spacing[2] },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: spacing[4],
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: radius['3xl'],
    padding: spacing[4],
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginTop: spacing[6],
    paddingHorizontal: spacing[4],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  garageCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: radius['3xl'],
    padding: spacing[6],
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[3],
  },
  quickAction: {
    alignItems: 'center',
    flex: 1,
  },
  quickActionIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  menuSection: {
    marginTop: spacing[6],
    paddingHorizontal: spacing[4],
  },
  menuItem: {
    backgroundColor: colors.surface.DEFAULT,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: radius['2xl'],
    marginBottom: spacing[2],
  },
  menuItemText: {
    flex: 1,
    marginLeft: spacing[3],
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing[4],
    marginTop: spacing[6],
    padding: spacing[4],
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 1,
    borderColor: colors.danger[600]!,
  },
});
