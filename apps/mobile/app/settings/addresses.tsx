import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, Card, Button, TextInput, FAB, Portal, Dialog, ActivityIndicator, IconButton, RadioButton } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

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
        <Ionicons name="location-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Adreslerim</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Adreslerinizi görmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Adreslerim</Text>
        <Text style={styles.headerCount}>{addresses.length}/{maxAddresses}</Text>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={80} color={TarodanColors.textLight} />
          <Text variant="titleMedium" style={styles.emptyTitle}>Kayıtlı adres yok</Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            Teslimat adresinizi ekleyin
          </Text>
          <Button mode="contained" onPress={openAddDialog}>
            Adres Ekle
          </Button>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {addresses.map((address) => (
            <Card key={address.id} style={styles.addressCard}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <View style={styles.titleRow}>
                    <Ionicons name="location" size={20} color={TarodanColors.primary} />
                    <Text variant="titleSmall" style={styles.addressTitle}>{address.title}</Text>
                    {address.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Varsayılan</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => openEditDialog(address)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      iconColor={TarodanColors.error}
                      onPress={() => handleDelete(address)}
                    />
                  </View>
                </View>
                
                <Text variant="bodyMedium">{address.fullName}</Text>
                <Text variant="bodySmall" style={styles.addressDetail}>{address.address}</Text>
                <Text variant="bodySmall" style={styles.addressDetail}>
                  {address.district}, {address.city} {address.postalCode}
                </Text>
                <Text variant="bodySmall" style={styles.addressDetail}>Tel: {address.phone}</Text>

                {!address.isDefault && (
                  <Button
                    mode="text"
                    compact
                    onPress={() => setDefaultMutation.mutate(address.id)}
                    loading={setDefaultMutation.isPending}
                    style={styles.defaultButton}
                  >
                    Varsayılan Yap
                  </Button>
                )}
              </Card.Content>
            </Card>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* FAB */}
      {addresses.length < maxAddresses && addresses.length > 0 && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={openAddDialog}
          color={TarodanColors.textOnPrimary}
        />
      )}

      {/* Add/Edit Dialog */}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>{editingAddress ? 'Adresi Düzenle' : 'Yeni Adres'}</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogContent}>
            <ScrollView>
              <TextInput
                label="Adres Başlığı *"
                value={formData.title}
                onChangeText={(text) => setFormData({ ...formData, title: text })}
                mode="outlined"
                placeholder="Örn: Ev, İş"
                style={styles.input}
              />
              <TextInput
                label="Ad Soyad *"
                value={formData.fullName}
                onChangeText={(text) => setFormData({ ...formData, fullName: text })}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Telefon *"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
              />
              <TextInput
                label="Adres *"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                mode="outlined"
                multiline
                numberOfLines={2}
                style={styles.input}
              />
              <View style={styles.row}>
                <TextInput
                  label="İl *"
                  value={formData.city}
                  onChangeText={(text) => setFormData({ ...formData, city: text })}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                />
                <TextInput
                  label="İlçe"
                  value={formData.district}
                  onChangeText={(text) => setFormData({ ...formData, district: text })}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                />
              </View>
              <TextInput
                label="Posta Kodu"
                value={formData.postalCode}
                onChangeText={(text) => setFormData({ ...formData, postalCode: text })}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
              />
              <TouchableOpacity
                style={styles.defaultCheckbox}
                onPress={() => setFormData({ ...formData, isDefault: !formData.isDefault })}
              >
                <Ionicons
                  name={formData.isDefault ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={TarodanColors.primary}
                />
                <Text style={styles.checkboxLabel}>Varsayılan adres olarak ayarla</Text>
              </TouchableOpacity>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>İptal</Button>
            <Button 
              mode="contained" 
              onPress={handleSubmit}
              loading={saveMutation.isPending}
            >
              Kaydet
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  headerCount: {
    color: TarodanColors.textOnPrimary,
    opacity: 0.8,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  addressCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
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
  },
  defaultBadge: {
    backgroundColor: TarodanColors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  defaultBadgeText: {
    color: TarodanColors.success,
    fontSize: 11,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
  },
  addressDetail: {
    color: TarodanColors.textSecondary,
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
    backgroundColor: TarodanColors.primary,
  },
  dialog: {
    maxHeight: '80%',
  },
  dialogContent: {
    paddingHorizontal: 0,
  },
  input: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
  },
  halfInput: {
    flex: 1,
    marginHorizontal: 0,
  },
  defaultCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 8,
  },
  checkboxLabel: {
    marginLeft: 8,
    color: TarodanColors.textPrimary,
  },
});
