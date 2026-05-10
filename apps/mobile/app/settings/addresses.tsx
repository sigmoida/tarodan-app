import { View, ScrollView, StyleSheet, TouchableOpacity, Pressable, Alert } from 'react-native';
import {
  Card,
  Button,
  FAB,
  IconButton,
  Modal,
  Spinner,
  Input,
  Text,
  theme,
} from '@tarodan/ui-native';
import { CityDistrictSelector } from '../../src/components/common';
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
  postalCode: string;
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
    address: '',
    city: '',
    district: '',
    postalCode: '',
    isDefault: false,
  });

  const maxAddresses = limits?.maxAddresses || 3;

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
      if (editingAddress) {
        return api.patch(`/users/me/addresses/${editingAddress.id}`, data);
      } else {
        return api.post('/users/me/addresses', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setDialogVisible(false);
      resetForm();
      Alert.alert('Başarılı', editingAddress ? 'Adres güncellendi' : 'Adres eklendi');
    },
    onError: () => {
      Alert.alert('Hata', 'Adres kaydedilemedi');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return api.delete(`/users/me/addresses/${addressId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      Alert.alert('Başarılı', 'Adres silindi');
    },
    onError: () => {
      Alert.alert('Hata', 'Adres silinemedi');
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
      Alert.alert(
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
    setFormData({
      title: address.title,
      fullName: address.fullName,
      phone: address.phone,
      address: address.address,
      city: address.city,
      district: address.district,
      postalCode: address.postalCode,
      isDefault: address.isDefault,
    });
    setDialogVisible(true);
  };

  const handleDelete = (address: Address) => {
    Alert.alert(
      'Adresi Sil',
      `"${address.title}" adresini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(address.id) },
      ]
    );
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.fullName || !formData.phone || !formData.address || !formData.city) {
      Alert.alert('Hata', 'Lütfen zorunlu alanları doldurun');
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
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.settingsAddresses')}</Text>
        <Text style={styles.headerCount}>{addresses.length}/{maxAddresses}</Text>
      </View>

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
          <Button variant="primary" title="Adres Ekle" onPress={openAddDialog} />
        </View>
      ) : (
        <ScrollView style={styles.content}>
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
                {address.district}, {address.city} {address.postalCode}
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
          <Input
            label="Telefon *"
            value={formData.phone}
            onChangeText={(text) => setFormData({ ...formData, phone: text })}
            keyboardType="phone-pad"
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
            onChangeCity={(city) => setFormData({ ...formData, city })}
            onChangeDistrict={(district) => setFormData({ ...formData, district })}
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
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
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
