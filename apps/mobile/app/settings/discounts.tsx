import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { api, discountsApi } from '../../src/services/api';
import { useTranslation } from '../../src/i18n';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  expiresAt: string | null;
  isUsed: boolean;
  usedAt?: string;
  minOrderAmount?: number;
  description?: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Süresiz';
  try {
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatDiscount(disc: Discount): string {
  if (disc.type === 'percentage') return `%${disc.value}`;
  return `₺${disc.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function DiscountsScreen() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [activeTab, setActiveTab] = useState<'available' | 'used'>('available');

  const fetchDiscounts = useCallback(async (showRefresh = false) => {
    if (!isAuthenticated) return;
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      let data: Discount[] = [];
      try {
        const res = await api.get('/discounts/my');
        data = res.data?.data || res.data || [];
      } catch {
        const res = await discountsApi.getAll();
        data = res.data?.data || res.data || [];
      }
      setDiscounts(data);
    } catch {
      if (!showRefresh) {
        Alert.alert('Hata', 'İndirim kuponları yüklenirken bir hata oluştu.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      fetchDiscounts();
    }, [fetchDiscounts])
  );

  const handleValidateCoupon = async () => {
    const trimmed = couponCode.trim();
    if (!trimmed) {
      Alert.alert('Uyarı', 'Lütfen bir kupon kodu girin.');
      return;
    }

    setIsValidating(true);
    try {
      const res = await discountsApi.validate(trimmed);
      const result = res.data?.data || res.data;
      Alert.alert('Kupon Geçerli', `${trimmed} kuponu başarıyla eklendi!`);
      setCouponCode('');
      fetchDiscounts();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Kupon kodu geçersiz veya süresi dolmuş.';
      Alert.alert('Geçersiz Kupon', msg);
    } finally {
      setIsValidating(false);
    }
  };

  const availableDiscounts = discounts.filter((d) => !d.isUsed && !isExpired(d.expiresAt));
  const usedDiscounts = discounts.filter((d) => d.isUsed || isExpired(d.expiresAt));
  const displayedDiscounts = activeTab === 'available' ? availableDiscounts : usedDiscounts;

  const renderDiscountItem = ({ item }: { item: Discount }) => {
    const expired = isExpired(item.expiresAt);
    const inactive = item.isUsed || expired;

    return (
      <View style={[styles.discountItem, inactive && styles.discountItemInactive]}>
        <View style={styles.discountLeft}>
          <View style={[styles.discountValueCircle, inactive && styles.discountValueCircleInactive]}>
            <Text style={[styles.discountValueText, inactive && styles.discountValueTextInactive]}>
              {formatDiscount(item)}
            </Text>
            <Text style={[styles.discountValueLabel, inactive && styles.discountValueLabelInactive]}>
              İNDİRİM
            </Text>
          </View>
        </View>

        <View style={styles.discountDivider}>
          {[...Array(8)].map((_, i) => (
            <View key={i} style={styles.dividerDot} />
          ))}
        </View>

        <View style={styles.discountRight}>
          <View style={styles.discountCodeRow}>
            <Text style={[styles.discountCode, inactive && styles.discountCodeInactive]}>{item.code}</Text>
            {item.isUsed && (
              <View style={[styles.usageBadge, { backgroundColor: TarodanColors.textTertiary + '20' }]}>
                <Text style={[styles.usageBadgeText, { color: TarodanColors.textTertiary }]}>Kullanıldı</Text>
              </View>
            )}
            {expired && !item.isUsed && (
              <View style={[styles.usageBadge, { backgroundColor: TarodanColors.error + '15' }]}>
                <Text style={[styles.usageBadgeText, { color: TarodanColors.error }]}>Süresi Doldu</Text>
              </View>
            )}
            {!inactive && (
              <View style={[styles.usageBadge, { backgroundColor: TarodanColors.success + '15' }]}>
                <Text style={[styles.usageBadgeText, { color: TarodanColors.success }]}>Aktif</Text>
              </View>
            )}
          </View>

          {item.description ? (
            <Text style={styles.discountDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}

          <View style={styles.discountMeta}>
            <Ionicons name="calendar-outline" size={13} color={TarodanColors.textTertiary} />
            <Text style={styles.discountMetaText}>
              {item.expiresAt ? `Son: ${formatDate(item.expiresAt)}` : 'Süresiz'}
            </Text>
          </View>

          {item.minOrderAmount ? (
            <View style={styles.discountMeta}>
              <Ionicons name="cart-outline" size={13} color={TarodanColors.textTertiary} />
              <Text style={styles.discountMetaText}>
                Min. ₺{item.minOrderAmount.toLocaleString('tr-TR')} sipariş
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('mobile.settingsDiscounts')}</Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <View style={styles.centeredContainer}>
          <Ionicons name="log-in-outline" size={48} color={TarodanColors.textTertiary} />
          <Text style={styles.emptyTitle}>Giriş Yapın</Text>
          <Text style={styles.emptySubtitle}>İndirim kuponlarınızı görmek için giriş yapın</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.primaryButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.settingsDiscounts')}</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Coupon Entry */}
      <View style={styles.couponEntryContainer}>
        <View style={styles.couponInputRow}>
          <TextInput
            style={styles.couponInput}
            placeholder="Kupon kodu girin..."
            placeholderTextColor={TarodanColors.textTertiary}
            value={couponCode}
            onChangeText={setCouponCode}
            autoCapitalize="characters"
            editable={!isValidating}
          />
          <TouchableOpacity
            style={[styles.couponApplyBtn, isValidating && styles.couponApplyBtnDisabled]}
            onPress={handleValidateCoupon}
            disabled={isValidating}
          >
            {isValidating ? (
              <ActivityIndicator size="small" color={TarodanColors.textOnPrimary} />
            ) : (
              <Text style={styles.couponApplyBtnText}>Uygula</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'available' && styles.tabActive]}
          onPress={() => setActiveTab('available')}
        >
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            Kullanılabilir ({availableDiscounts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'used' && styles.tabActive]}
          onPress={() => setActiveTab('used')}
        >
          <Text style={[styles.tabText, activeTab === 'used' && styles.tabTextActive]}>
            Kullanılmış ({usedDiscounts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayedDiscounts}
          keyExtractor={(item) => item.id}
          renderItem={renderDiscountItem}
          contentContainerStyle={displayedDiscounts.length === 0 ? styles.emptyListContainer : styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchDiscounts(true)}
              colors={[TarodanColors.primary]}
              tintColor={TarodanColors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="pricetag-outline" size={48} color={TarodanColors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'available' ? 'İndirim kuponunuz bulunmuyor' : 'Kullanılmış kupon yok'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'available'
                  ? 'Yukarıdaki alandan kupon kodu ekleyebilirsiniz'
                  : 'Kullandığınız kuponlar burada görünecektir'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBackBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  headerPlaceholder: {
    width: 32,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  couponEntryContainer: {
    backgroundColor: TarodanColors.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  couponInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  couponInput: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundTertiary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: TarodanColors.textPrimary,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  couponApplyBtn: {
    backgroundColor: TarodanColors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  couponApplyBtnDisabled: {
    opacity: 0.6,
  },
  couponApplyBtnText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.background,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: TarodanColors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: TarodanColors.textTertiary,
  },
  tabTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  discountItem: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  discountItemInactive: {
    opacity: 0.65,
  },
  discountLeft: {
    width: 90,
    backgroundColor: TarodanColors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  discountValueCircle: {
    alignItems: 'center',
  },
  discountValueCircleInactive: {
    opacity: 0.7,
  },
  discountValueText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  discountValueTextInactive: {
    color: TarodanColors.textTertiary,
  },
  discountValueLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TarodanColors.primary,
    letterSpacing: 1,
    marginTop: 2,
  },
  discountValueLabelInactive: {
    color: TarodanColors.textTertiary,
  },
  discountDivider: {
    width: 1,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dividerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TarodanColors.border,
  },
  discountRight: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  discountCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  discountCode: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    letterSpacing: 0.5,
  },
  discountCodeInactive: {
    color: TarodanColors.textTertiary,
  },
  usageBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  usageBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  discountDesc: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  discountMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  discountMetaText: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TarodanColors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginTop: 8,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
  },
  primaryButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
