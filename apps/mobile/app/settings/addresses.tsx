import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import {
  Card,
  Button,
  FAB,
  IconButton,
  Modal,
  Spinner,
  Input,
  Text,
  ScreenHeader,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import { CityDistrictSelector, PhoneInput, ThemedRefreshControl } from '../../src/components/common';
import { DEFAULT_COUNTRY_CODE, normalizePhoneForPayload, splitPhone } from '../../src/utils/phone';
import { useRefresh } from '../../src/hooks/useRefresh';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';

const { colors, spacing, radius } = theme;

interface Address {
  id: string;
  title: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  postalCode?: string;
  zipCode?: string; // API bu alanı döndürüyor
  isDefault: boolean;
}

export default function AddressesScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, limits } = useAuthStore();
  const queryClient = useQueryClient();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    fullName: '',
    phone: '',
    phoneCountryCode: DEFAULT_COUNTRY_CODE,
    address: '',
    city: '',
    district: '',
    postalCode: '',
    isDefault: false,
  });

  const maxAddresses = limits?.maxAddresses || 10;

  // Fetch addresses
  const { data: addressesData, isLoading, refetch } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/addresses');
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Failed to fetch addresses');
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const addresses: Address[] = addressesData || [];

  const { refreshing, onRefresh } = useRefresh(refetch);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // API CreateAddressDto `zipCode` bekliyor (postalCode değil) — eşle, yoksa posta kodu kaybolur.
      // phoneCountryCode DTO'da yok; telefonu "+90…" olarak normalize edip payload'dan çıkar.
      const { postalCode, phoneCountryCode, ...rest } = data;
      const payload = {
        ...rest,
        phone: normalizePhoneForPayload(data.phone, phoneCountryCode),
        zipCode: postalCode,
      };
      if (editingAddress) {
        return api.patch(`/users/me/addresses/${editingAddress.id}`, payload);
      } else {
        return api.post('/users/me/addresses', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setDialogVisible(false);
      resetForm();
      appAlert('Başarılı', editingAddress ? 'Adres güncellendi' : 'Adres eklendi');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      appAlert('Hata', Array.isArray(msg) ? msg.join('\n') : msg || 'Adres kaydedilemedi');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return api.delete(`/users/me/addresses/${addressId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      appAlert('Başarılı', 'Adres silindi');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      appAlert('Hata', Array.isArray(msg) ? msg.join('\n') : msg || 'Adres silinemedi');
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return api.patch(`/users/me/addresses/${addressId}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      fullName: '',
      phone: '',
      phoneCountryCode: DEFAULT_COUNTRY_CODE,
      address: '',
      city: '',
      district: '',
      postalCode: '',
      isDefault: false,
    });
    setEditingAddress(null);
  };

  const openAddDialog = () => {
    if (addresses.length >= maxAddresses) {
      appAlert(
        'Adres Limiti',
        `Ücretsiz üyeler en fazla ${maxAddresses} adres kaydedebilir. Premium üyelikle daha fazla adres ekleyin.`,
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Premium\'a Geç', onPress: () => router.push('/upgrade') },
        ]
      );
      return;
    }
    resetForm();
    setDialogVisible(true);
  };

  const openEditDialog = (address: Address) => {
    setEditingAddress(address);
    const { countryCode, phone } = splitPhone(address.phone);
    setFormData({
      title: address.title,
      fullName: address.fullName,
      phone,
      phoneCountryCode: countryCode,
      address: address.address,
      city: address.city,
      district: address.district,
      postalCode: address.zipCode ?? address.postalCode ?? '',
      isDefault: address.isDefault,
    });
    setDialogVisible(true);
  };

  const handleDelete = (address: Address) => {
    appAlert(
      'Adresi Sil',
      `"${address.title}" adresini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(address.id) },
      ]
    );
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.fullName || !formData.phone || !formData.address || !formData.city || !formData.district) {
      appAlert('Hata', 'Lütfen zorunlu alanları doldurun (ilçe dahil)');
      return;
    }
    // API DTO kuralları — client-side önden uygula (yoksa ham 400 "Adres kaydedilemedi")
    if (formData.address.trim().length < 10) {
      appAlert('Hata', 'Adres en az 10 karakter olmalıdır');
      return;
    }
    if (formData.phone.replace(/\D/g, '').length < 10) {
      appAlert('Hata', 'Geçerli bir telefon numarası giriniz (en az 10 hane)');
      return;
    }
    saveMutation.mutate(formData);
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="location-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h3" style={styles.title}>{t("mobile.settingsAddresses")}</Text>
        <Text variant="body" style={styles.subtitle}>
          Adreslerinizi görmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('mobile.settingsAddresses')}
        onBack={() => router.back()}
        right={<Text style={styles.headerCount}>{addresses.length}/{maxAddresses}</Text>}
      />

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>{t("mobile.noSavedAddress")}</Text>
          <Text variant="body" style={styles.emptySubtitle}>
            Teslimat adresinizi ekleyin
          </Text>
          <Button variant="primary" title="Adres Ekle" onPress={openAddDialog} style={{ alignSelf: 'center' }} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {addresses.map((address) => (
            <Card key={address.id} style={styles.addressCard}>
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  <Ionicons name="location" size={20} color={colors.primary[600]!} />
                  <Text variant="body" style={styles.addressTitle}>{address.title}</Text>
                  {address.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>{t("mobile.default")}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardActions}>
                  <IconButton
                    icon="pencil"
                    size="sm"
                    accessibilityLabel="Adresi düzenle"
                    onPress={() => openEditDialog(address)}
                  />
                  <IconButton
                    icon="trash-outline"
                    variant="danger"
                    size="sm"
                    accessibilityLabel="Adresi sil"
                    onPress={() => handleDelete(address)}
                  />
                </View>
              </View>

              <Text variant="body">{address.fullName}</Text>
              <Text variant="bodySm" style={styles.addressDetail}>{address.address}</Text>
              <Text variant="bodySm" style={styles.addressDetail}>
                {address.district}, {address.city} {address.zipCode ?? address.postalCode ?? ''}
              </Text>
              <Text variant="bodySm" style={styles.addressDetail}>Tel: {address.phone}</Text>

              {!address.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Varsayılan Yap"
                  onPress={() => setDefaultMutation.mutate(address.id)}
                  isLoading={setDefaultMutation.isPending}
                  style={styles.defaultButton}
                />
              )}
            </Card>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* FAB */}
      {addresses.length < maxAddresses && addresses.length > 0 && (
        <FAB
          icon="add"
          accessibilityLabel="Yeni adres ekle"
          style={styles.fab}
          onPress={openAddDialog}
        />
      )}

      {/* Add/Edit Dialog */}
      <Modal
        isOpen={dialogVisible}
        onClose={() => setDialogVisible(false)}
        title={editingAddress ? 'Adresi Düzenle' : 'Yeni Adres'}
      >
        <ScrollView style={styles.dialogScroll}>
          <Input
            testID="address-title-input"
            label="Adres Başlığı *"
            value={formData.title}
            onChangeText={(text) => setFormData({ ...formData, title: text })}
            placeholder={t("mobile.addressTitlePlaceholder")}
            containerStyle={styles.input}
          />
          <Input
            label="Ad Soyad *"
            value={formData.fullName}
            onChangeText={(text) => setFormData({ ...formData, fullName: text })}
            containerStyle={styles.input}
          />
          <PhoneInput
            label="Telefon *"
            countryCode={formData.phoneCountryCode}
            onCountryCodeChange={(code) => setFormData({ ...formData, phoneCountryCode: code })}
            phone={formData.phone}
            onPhoneChange={(phone) => setFormData({ ...formData, phone })}
            containerStyle={styles.input}
          />
          <Input
            label="Adres *"
            value={formData.address}
            onChangeText={(text) => setFormData({ ...formData, address: text })}
            multiline
            numberOfLines={2}
            containerStyle={styles.input}
          />
          <CityDistrictSelector
            city={formData.city}
            district={formData.district}
            // Fonksiyonel güncelleme şart: il seçilince selector aynı anda
            // onChangeCity + onChangeDistrict('') çağırır; stale obje ile
            // yazılırsa ikinci çağrı ilk yazılan şehri ezer.
            onChangeCity={(city) => setFormData((prev) => ({ ...prev, city }))}
            onChangeDistrict={(district) => setFormData((prev) => ({ ...prev, district }))}
          />
          <Input
            label="Posta Kodu"
            value={formData.postalCode}
            onChangeText={(text) => setFormData({ ...formData, postalCode: text })}
            keyboardType="numeric"
            containerStyle={styles.input}
          />
          <Pressable
            style={styles.defaultCheckbox}
            onPress={() => setFormData({ ...formData, isDefault: !formData.isDefault })}
          >
            <Ionicons
              name={formData.isDefault ? 'checkbox' : 'square-outline'}
              size={24}
              color={colors.primary[600]!}
            />
            <Text style={styles.checkboxLabel}>{t("mobile.setAsDefault")}</Text>
          </Pressable>
        </ScrollView>
        <View style={styles.dialogActions}>
          <Button variant="ghost" title={t("mobile.cancel")} onPress={() => setDialogVisible(false)} />
          <Button
            testID="address-save-button"
            variant="primary"
            title="Kaydet"
            onPress={handleSubmit}
            isLoading={saveMutation.isPending}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  headerCount: {
    color: colors.white,
    opacity: 0.8,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  addressCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addressTitle: {
    marginLeft: 8,
    fontWeight: '600',
  },
  defaultBadge: {
    backgroundColor: colors.success[50]!,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: 8,
  },
  defaultBadgeText: {
    color: colors.success[700]!,
    fontSize: 11,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
  },
  addressDetail: {
    color: colors.text.muted,
    marginTop: 2,
  },
  defaultButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  dialogScroll: {
    maxHeight: 420,
  },
  input: {
    marginBottom: spacing[3],
  },
  defaultCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  checkboxLabel: {
    marginLeft: 8,
    color: colors.text.heading,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
