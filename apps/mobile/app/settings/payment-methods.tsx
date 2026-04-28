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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { paymentsApi } from '../../src/services/api';

interface PaymentMethod {
  id: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  cardHolder?: string;
}

const BRAND_ICONS: Record<string, { icon: string; color: string }> = {
  visa: { icon: 'card', color: '#1A1F71' },
  mastercard: { icon: 'card', color: '#EB001B' },
  amex: { icon: 'card', color: '#006FCF' },
  troy: { icon: 'card', color: '#00427A' },
};

function getBrandDisplay(brand: string): { icon: string; color: string; label: string } {
  const key = brand?.toLowerCase() || '';
  const cfg = BRAND_ICONS[key] || { icon: 'card-outline', color: TarodanColors.textSecondary };
  const labels: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    troy: 'Troy',
  };
  return { ...cfg, label: labels[key] || brand || 'Kart' };
}

export default function PaymentMethodsScreen() {
  const { isAuthenticated } = useAuthStore();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMethods = useCallback(async (showRefresh = false) => {
    if (!isAuthenticated) return;
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await paymentsApi.getMethods();
      setMethods(res.data?.data || res.data || []);
    } catch {
      if (!showRefresh) {
        Alert.alert('Hata', 'Ödeme yöntemleri yüklenirken bir hata oluştu.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      fetchMethods();
    }, [fetchMethods])
  );

  const handleDelete = (method: PaymentMethod) => {
    const brandInfo = getBrandDisplay(method.brand);
    Alert.alert(
      'Kartı Sil',
      `${brandInfo.label} •••• ${method.last4} kartını silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(method.id);
            try {
              await paymentsApi.deleteMethod(method.id);
              setMethods((prev) => prev.filter((m) => m.id !== method.id));
            } catch {
              Alert.alert('Hata', 'Kart silinirken bir hata oluştu.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handleAddCard = () => {
    Alert.alert('Yakında', 'Yeni kart ekleme özelliği yakında aktif olacaktır.');
  };

  const renderMethodItem = ({ item }: { item: PaymentMethod }) => {
    const brandInfo = getBrandDisplay(item.brand);
    const isDeleting = deletingId === item.id;

    return (
      <View style={styles.cardItem}>
        <View style={[styles.cardIconContainer, { backgroundColor: brandInfo.color + '12' }]}>
          <Ionicons name={brandInfo.icon as any} size={24} color={brandInfo.color} />
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardBrand}>{brandInfo.label}</Text>
            {item.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Varsayılan</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardNumber}>•••• •••• •••• {item.last4}</Text>
          <Text style={styles.cardExpiry}>
            Son kullanma: {String(item.expiryMonth).padStart(2, '0')}/{item.expiryYear}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          disabled={isDeleting}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={TarodanColors.error} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={TarodanColors.error} />
          )}
        </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Ödeme Yöntemleri</Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <View style={styles.centeredContainer}>
          <Ionicons name="log-in-outline" size={48} color={TarodanColors.textTertiary} />
          <Text style={styles.emptyTitle}>Giriş Yapın</Text>
          <Text style={styles.emptySubtitle}>Ödeme yöntemlerinizi yönetmek için giriş yapın</Text>
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
        <Text style={styles.headerTitle}>Ödeme Yöntemleri</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {isLoading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : (
        <FlatList
          data={methods}
          keyExtractor={(item) => item.id}
          renderItem={renderMethodItem}
          contentContainerStyle={methods.length === 0 ? styles.emptyListContainer : styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchMethods(true)}
              colors={[TarodanColors.primary]}
              tintColor={TarodanColors.primary}
            />
          }
          ListHeaderComponent={
            methods.length > 0 ? (
              <TouchableOpacity style={styles.addCardButton} onPress={handleAddCard} activeOpacity={0.7}>
                <View style={styles.addCardIconCircle}>
                  <Ionicons name="add" size={22} color={TarodanColors.primary} />
                </View>
                <Text style={styles.addCardText}>Yeni Kart Ekle</Text>
                <Ionicons name="chevron-forward" size={20} color={TarodanColors.textTertiary} />
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="card-outline" size={48} color={TarodanColors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Kayıtlı ödeme yönteminiz yok</Text>
              <Text style={styles.emptySubtitle}>Hızlı ödeme için kart ekleyebilirsiniz</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleAddCard}>
                <Ionicons name="add-circle-outline" size={18} color={TarodanColors.textOnPrimary} />
                <Text style={styles.primaryButtonText}>Kart Ekle</Text>
              </TouchableOpacity>
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
  listContent: {
    padding: 16,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TarodanColors.primary + '30',
    borderStyle: 'dashed',
  },
  addCardIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TarodanColors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addCardText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.primary,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardBrand: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  defaultBadge: {
    backgroundColor: TarodanColors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: TarodanColors.primary,
  },
  cardNumber: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardExpiry: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
  },
  deleteBtn: {
    padding: 8,
    marginLeft: 8,
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
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
    marginTop: 4,
  },
  primaryButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
