import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Portal, Dialog, Button, ActivityIndicator, Card, Switch, FAB, Snackbar, IconButton, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Text, TextInput, ScreenHeader, EmptyState, ScreenLoader } from '../../src/components/common';
import { TarodanColors } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { discountsApi, productsApi } from '../../src/services/api';
import { formatPrice } from '../../src/utils/format';

/**
 * Satıcı kupon/indirim yönetimi.
 * Web `apps/web/src/app/profile/discounts/page.tsx` paritesi.
 */

type DiscountType = 'percentage' | 'fixed_amount';
type DiscountScope = 'seller' | 'product';

interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: DiscountType;
  value: number;
  scope: DiscountScope;
  targetProductIds: string[];
  minCartValue: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isStackable: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  isCurrentlyValid: boolean;
}

interface MyProduct {
  id: string;
  title: string;
  price: number;
  status?: string;
}

const FILTERS: Array<{ value: '' | 'active' | 'inactive' | 'expired'; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Pasif' },
  { value: 'expired', label: 'Süresi Dolmuş' },
];

const initialForm = () => ({
  id: '' as string | undefined,
  code: '',
  name: '',
  description: '',
  type: 'percentage' as DiscountType,
  value: '10',
  scope: 'seller' as DiscountScope,
  targetProductIds: [] as string[],
  minCartValue: '',
  maxDiscountAmount: '',
  usageLimitTotal: '',
  usageLimitPerUser: '1',
  isStackable: false,
  isActive: true,
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
});

export default function DiscountsScreen() {
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'' | 'active' | 'inactive' | 'expired'>('');
  const [formOpen, setFormOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>(
    { visible: false, message: '' },
  );

  const discountsQuery = useQuery({
    queryKey: ['my-discounts'],
    queryFn: async () => {
      const response = await discountsApi.getAll({ limit: 100 });
      const data: any = response.data;
      const items: Discount[] = data?.items ?? data?.data ?? data ?? [];
      return Array.isArray(items) ? items : [];
    },
    enabled: isAuthenticated,
  });

  const productsQuery = useQuery({
    queryKey: ['my-products-for-discount'],
    queryFn: async () => {
      try {
        const response = await productsApi.getMyListings({ limit: 100, status: 'active' });
        const data: any = response.data;
        const items: MyProduct[] = data?.data ?? data?.items ?? data ?? [];
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const filteredDiscounts = useMemo(() => {
    const list = discountsQuery.data ?? [];
    const now = new Date();
    if (filter === 'active') {
      return list.filter((d) => d.isActive && d.isCurrentlyValid !== false);
    }
    if (filter === 'inactive') {
      return list.filter((d) => !d.isActive);
    }
    if (filter === 'expired') {
      return list.filter((d) => new Date(d.endDate) < now);
    }
    return list;
  }, [discountsQuery.data, filter]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (form.id) {
        return discountsApi.update(form.id, payload);
      }
      return discountsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-discounts'] });
      setFormOpen(false);
      setForm(initialForm());
      setSnackbar({ visible: true, message: form.id ? 'İndirim güncellendi' : 'İndirim oluşturuldu' });
    },
    onError: (e: any) => {
      Alert.alert('Hata', e?.response?.data?.message || 'İndirim kaydedilemedi.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-discounts'] });
      setSnackbar({ visible: true, message: 'İndirim silindi' });
    },
    onError: (e: any) => {
      Alert.alert('Hata', e?.response?.data?.message || 'İndirim silinemedi.');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      discountsApi.update(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-discounts'] });
    },
  });

  const openCreate = () => {
    setForm(initialForm());
    setFormOpen(true);
  };

  const openEdit = (d: Discount) => {
    setForm({
      id: d.id,
      code: d.code ?? '',
      name: d.name,
      description: d.description ?? '',
      type: d.type,
      value: String(d.value),
      scope: d.scope === 'product' ? 'product' : 'seller',
      targetProductIds: d.targetProductIds ?? [],
      minCartValue: d.minCartValue?.toString() ?? '',
      maxDiscountAmount: d.maxDiscountAmount?.toString() ?? '',
      usageLimitTotal: d.usageLimitTotal?.toString() ?? '',
      usageLimitPerUser: String(d.usageLimitPerUser ?? 1),
      isStackable: d.isStackable,
      isActive: d.isActive,
      startDate: d.startDate.split('T')[0],
      endDate: d.endDate.split('T')[0],
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      Alert.alert('Eksik', 'İndirim adı gerekli.');
      return;
    }
    const valueNum = parseFloat(form.value);
    if (!valueNum || valueNum <= 0) {
      Alert.alert('Eksik', 'Geçerli bir indirim değeri girin.');
      return;
    }
    if (form.type === 'percentage' && valueNum > 100) {
      Alert.alert('Hata', 'Yüzde indirim 100\'den büyük olamaz.');
      return;
    }
    if (form.scope === 'product' && form.targetProductIds.length === 0) {
      Alert.alert('Eksik', 'Lütfen en az bir ürün seçin.');
      return;
    }

    const payload: any = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      value: valueNum,
      scope: form.scope,
      targetProductIds: form.scope === 'product' ? form.targetProductIds : [],
      minCartValue: form.minCartValue ? parseFloat(form.minCartValue) : undefined,
      maxDiscountAmount: form.maxDiscountAmount ? parseFloat(form.maxDiscountAmount) : undefined,
      usageLimitTotal: form.usageLimitTotal ? parseInt(form.usageLimitTotal, 10) : undefined,
      usageLimitPerUser: parseInt(form.usageLimitPerUser, 10) || 1,
      isStackable: form.isStackable,
      isActive: form.isActive,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
    };

    saveMutation.mutate(payload);
  };

  const handleDelete = (d: Discount) => {
    Alert.alert(
      'İndirimi Sil',
      `"${d.name}" indirimini silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(d.id) },
      ],
    );
  };

  const formatDate = (s: string) => new Date(s).toLocaleDateString('tr-TR');

  const valueLabel = (d: Discount) =>
    d.type === 'percentage'
      ? `%${d.value}`
      : `₺${d.value.toLocaleString('tr-TR')}`;

  const products = productsQuery.data ?? [];

  // Auth + satıcı kontrolü web ile aynı (hooks sonrasında, kuralları korumak için).
  if (!isAuthenticated) {
    return (
      <View style={styles.gateContainer}>
        <ScreenHeader title="İndirimlerim" />
        <EmptyState
          icon="lock-closed-outline"
          title="Giriş Gerekli"
          subtitle="İndirimlerinizi yönetmek için giriş yapmalısınız."
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login' as any)}
        />
      </View>
    );
  }

  if (user && user.isSeller === false) {
    return (
      <View style={styles.gateContainer}>
        <ScreenHeader title="İndirimlerim" />
        <EmptyState
          icon="storefront-outline"
          title="Satıcı Olun"
          subtitle="İndirim oluşturmak için satıcı hesabı gerekli."
          actionLabel="Satıcı Ol"
          onAction={() => router.push('/seller/register' as any)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="İndirimlerim" />

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            selected={filter === f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            textStyle={filter === f.value ? styles.filterChipTextActive : undefined}
          >
            {f.label}
          </Chip>
        ))}
      </View>

      {discountsQuery.isLoading ? (
        <ScreenLoader />
      ) : filteredDiscounts.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="Henüz indiriminiz yok"
          subtitle="Mağazanız için ilk indirim kuponunuzu oluşturun."
          actionLabel="Yeni İndirim"
          onAction={openCreate}
        />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {filteredDiscounts.map((d) => (
            <Card key={d.id} style={styles.discountCard}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.discountName}>{d.name}</Text>
                    {d.code ? (
                      <View style={styles.codeBadge}>
                        <Ionicons name="pricetag" size={12} color={TarodanColors.primary} />
                        <Text style={styles.codeText}>{d.code}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.valueWrap}>
                    <Text style={styles.valueText}>{valueLabel(d)}</Text>
                    <Text style={styles.valueLabel}>İndirim</Text>
                  </View>
                </View>

                {d.description ? (
                  <Text style={styles.discountDesc}>{d.description}</Text>
                ) : null}

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="layers-outline" size={14} color={TarodanColors.textSecondary} />
                    <Text style={styles.metaText}>
                      {d.scope === 'product' ? 'Seçili Ürünler' : 'Tüm Mağaza'}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={TarodanColors.textSecondary} />
                    <Text style={styles.metaText}>
                      {formatDate(d.startDate)} - {formatDate(d.endDate)}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="people-outline" size={14} color={TarodanColors.textSecondary} />
                    <Text style={styles.metaText}>
                      {d.usedCount} / {d.usageLimitTotal ?? '∞'}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <View style={styles.activeRow}>
                    <Switch
                      value={d.isActive}
                      onValueChange={(v: boolean) => toggleActiveMutation.mutate({ id: d.id, isActive: v })}
                      color={TarodanColors.primary}
                    />
                    <Text style={styles.activeLabel}>{d.isActive ? 'Aktif' : 'Pasif'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <IconButton
                      icon="pencil"
                      iconColor={TarodanColors.primary}
                      onPress={() => openEdit(d)}
                      size={20}
                    />
                    <IconButton
                      icon="delete"
                      iconColor={TarodanColors.error}
                      onPress={() => handleDelete(d)}
                      size={20}
                    />
                  </View>
                </View>
              </Card.Content>
            </Card>
          ))}
        </ScrollView>
      )}

      <FAB
        icon="plus"
        style={styles.fab}
        color="#fff"
        onPress={openCreate}
        label="Yeni İndirim"
      />

      {/* Form Dialog */}
      <Portal>
        <Dialog visible={formOpen} onDismiss={() => setFormOpen(false)} style={styles.dialog}>
          <Dialog.Title>{form.id ? 'İndirimi Düzenle' : 'Yeni İndirim'}</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <View style={{ paddingVertical: 8 }}>
                <TextInput
                  mode="outlined"
                  label="İndirim Adı *"
                  value={form.name}
                  onChangeText={(v: string) => setForm({ ...form, name: v })}
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="Açıklama"
                  value={form.description}
                  onChangeText={(v: string) => setForm({ ...form, description: v })}
                  multiline
                  numberOfLines={2}
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="Kupon Kodu (opsiyonel)"
                  value={form.code}
                  onChangeText={(v: string) => setForm({ ...form, code: v.toUpperCase() })}
                  autoCapitalize="characters"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />

                <Text style={styles.sectionLabel}>İndirim Tipi</Text>
                <View style={styles.toggleRow}>
                  <Chip
                    selected={form.type === 'percentage'}
                    onPress={() => setForm({ ...form, type: 'percentage' })}
                    style={[styles.toggleChip, form.type === 'percentage' && styles.toggleChipActive]}
                    textStyle={form.type === 'percentage' ? styles.toggleChipTextActive : undefined}
                  >
                    Yüzde (%)
                  </Chip>
                  <Chip
                    selected={form.type === 'fixed_amount'}
                    onPress={() => setForm({ ...form, type: 'fixed_amount' })}
                    style={[styles.toggleChip, form.type === 'fixed_amount' && styles.toggleChipActive]}
                    textStyle={form.type === 'fixed_amount' ? styles.toggleChipTextActive : undefined}
                  >
                    Sabit (TL)
                  </Chip>
                </View>

                <TextInput
                  mode="outlined"
                  label={`Değer * ${form.type === 'percentage' ? '(%)' : '(TL)'}`}
                  value={form.value}
                  onChangeText={(v: string) => setForm({ ...form, value: v.replace(',', '.') })}
                  keyboardType="numeric"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />

                <Text style={styles.sectionLabel}>Kapsam</Text>
                <View style={styles.toggleRow}>
                  <Chip
                    selected={form.scope === 'seller'}
                    onPress={() => setForm({ ...form, scope: 'seller', targetProductIds: [] })}
                    style={[styles.toggleChip, form.scope === 'seller' && styles.toggleChipActive]}
                    textStyle={form.scope === 'seller' ? styles.toggleChipTextActive : undefined}
                  >
                    Tüm Mağaza
                  </Chip>
                  <Chip
                    selected={form.scope === 'product'}
                    onPress={() => setForm({ ...form, scope: 'product' })}
                    style={[styles.toggleChip, form.scope === 'product' && styles.toggleChipActive]}
                    textStyle={form.scope === 'product' ? styles.toggleChipTextActive : undefined}
                  >
                    Seçili Ürünler
                  </Chip>
                </View>

                {form.scope === 'product' ? (
                  <TouchableOpacity
                    style={styles.productPickerRow}
                    onPress={() => setProductPickerOpen(true)}
                  >
                    <Ionicons name="cube-outline" size={20} color={TarodanColors.primary} />
                    <Text style={styles.productPickerText}>
                      {form.targetProductIds.length > 0
                        ? `${form.targetProductIds.length} ürün seçildi`
                        : 'Ürün seçin'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={TarodanColors.textTertiary} />
                  </TouchableOpacity>
                ) : null}

                <Text style={styles.sectionLabel}>Geçerlilik (YYYY-AA-GG)</Text>
                <View style={styles.dateRow}>
                  <TextInput
                    mode="outlined"
                    label="Başlangıç"
                    value={form.startDate}
                    onChangeText={(v: string) => setForm({ ...form, startDate: v })}
                    placeholder="2026-04-22"
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                  />
                  <TextInput
                    mode="outlined"
                    label="Bitiş"
                    value={form.endDate}
                    onChangeText={(v: string) => setForm({ ...form, endDate: v })}
                    placeholder="2026-05-22"
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                  />
                </View>

                <Text style={styles.sectionLabel}>Limitler (opsiyonel)</Text>
                <TextInput
                  mode="outlined"
                  label="Min Sepet Tutarı (TL)"
                  value={form.minCartValue}
                  onChangeText={(v: string) => setForm({ ...form, minCartValue: v.replace(',', '.') })}
                  keyboardType="numeric"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="Max İndirim Tutarı (TL)"
                  value={form.maxDiscountAmount}
                  onChangeText={(v: string) => setForm({ ...form, maxDiscountAmount: v.replace(',', '.') })}
                  keyboardType="numeric"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="Toplam Kullanım Limiti"
                  value={form.usageLimitTotal}
                  onChangeText={(v: string) => setForm({ ...form, usageLimitTotal: v.replace(/[^0-9]/g, '') })}
                  keyboardType="numeric"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  mode="outlined"
                  label="Kullanıcı Başına Limit"
                  value={form.usageLimitPerUser}
                  onChangeText={(v: string) => setForm({ ...form, usageLimitPerUser: v.replace(/[^0-9]/g, '') || '1' })}
                  keyboardType="numeric"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Birleşebilir İndirim</Text>
                  <Switch
                    value={form.isStackable}
                    onValueChange={(v: boolean) => setForm({ ...form, isStackable: v })}
                    color={TarodanColors.primary}
                  />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Aktif</Text>
                  <Switch
                    value={form.isActive}
                    onValueChange={(v: boolean) => setForm({ ...form, isActive: v })}
                    color={TarodanColors.primary}
                  />
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>

          <Dialog.Actions>
            <Button onPress={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Vazgeç
            </Button>
            <Button
              mode="contained"
              buttonColor={TarodanColors.primary}
              onPress={handleSubmit}
              loading={saveMutation.isPending}
              disabled={saveMutation.isPending}
            >
              {form.id ? 'Güncelle' : 'Oluştur'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Product picker */}
        <Dialog
          visible={productPickerOpen}
          onDismiss={() => setProductPickerOpen(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Ürün Seç</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              {productsQuery.isLoading ? (
                <ActivityIndicator color={TarodanColors.primary} style={{ paddingVertical: 24 }} />
              ) : products.length === 0 ? (
                <Text style={styles.emptyProducts}>Aktif ürününüz yok.</Text>
              ) : (
                products.map((p) => {
                  const checked = form.targetProductIds.includes(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.productRow}
                      onPress={() => {
                        const next = checked
                          ? form.targetProductIds.filter((id) => id !== p.id)
                          : [...form.targetProductIds, p.id];
                        setForm({ ...form, targetProductIds: next });
                      }}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={checked ? TarodanColors.primary : TarodanColors.textTertiary}
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.productTitle} numberOfLines={1}>
                          {p.title}
                        </Text>
                        <Text style={styles.productPrice}>{formatPrice(p.price)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setProductPickerOpen(false)}>Tamam</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={2000}
        style={{ backgroundColor: TarodanColors.success }}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  gateContainer: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: TarodanColors.background,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
  },
  filterChip: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  filterChipActive: {
    backgroundColor: TarodanColors.primaryLight,
  },
  filterChipTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  discountCard: {
    backgroundColor: TarodanColors.background,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TarodanColors.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  discountName: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: TarodanColors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  codeText: {
    color: TarodanColors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  valueWrap: {
    alignItems: 'flex-end',
  },
  valueText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  valueLabel: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
  },
  discountDesc: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginBottom: 8,
  },
  metaRow: {
    gap: 6,
    marginVertical: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: TarodanColors.borderLight,
    paddingTop: 8,
    marginTop: 8,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: TarodanColors.primary,
  },
  dialog: {
    backgroundColor: TarodanColors.background,
    maxHeight: '90%',
  },
  dialogScroll: {
    paddingHorizontal: 0,
    maxHeight: 460,
  },
  input: {
    marginBottom: 10,
    backgroundColor: TarodanColors.background,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
    marginTop: 8,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  toggleChip: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  toggleChipActive: {
    backgroundColor: TarodanColors.primaryLight,
  },
  toggleChipTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  productPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 8,
    marginBottom: 10,
  },
  productPickerText: {
    flex: 1,
    fontSize: 14,
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  emptyProducts: {
    textAlign: 'center',
    color: TarodanColors.textSecondary,
    paddingVertical: 24,
    fontSize: 14,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TarodanColors.borderLight,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
  },
  productPrice: {
    fontSize: 13,
    color: TarodanColors.primary,
    marginTop: 2,
  },
});
