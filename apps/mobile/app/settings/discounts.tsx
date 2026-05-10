import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import {
  Modal,
  Button,
  Spinner,
  Card,
  Switch,
  FAB,
  Snackbar,
  IconButton,
  Chip,
  Input,
  Text,
  ScreenHeader,
  EmptyState,
  ScreenLoader,
  theme,
} from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../src/stores/authStore';
import { discountsApi, productsApi } from '../../src/services/api';
import { formatPrice } from '../../src/utils/format';

const { colors, spacing, radius } = theme;

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
            label={f.label}
            selected={filter === f.value}
            variant={filter === f.value ? 'primary' : 'neutral'}
            onPress={() => setFilter(f.value)}
          />
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
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.discountName}>{d.name}</Text>
                  {d.code ? (
                    <View style={styles.codeBadge}>
                      <Ionicons name="pricetag" size={12} color={colors.primary[600]!} />
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
                  <Ionicons name="layers-outline" size={14} color={colors.text.muted} />
                  <Text style={styles.metaText}>
                    {d.scope === 'product' ? 'Seçili Ürünler' : 'Tüm Mağaza'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
                  <Text style={styles.metaText}>
                    {formatDate(d.startDate)} - {formatDate(d.endDate)}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={14} color={colors.text.muted} />
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
                  />
                  <Text style={styles.activeLabel}>{d.isActive ? 'Aktif' : 'Pasif'}</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <IconButton
                    icon="pencil"
                    size="sm"
                    accessibilityLabel="İndirimi düzenle"
                    onPress={() => openEdit(d)}
                  />
                  <IconButton
                    icon="trash-outline"
                    variant="danger"
                    size="sm"
                    accessibilityLabel="İndirimi sil"
                    onPress={() => handleDelete(d)}
                  />
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <FAB
        icon="add"
        accessibilityLabel="Yeni indirim oluştur"
        style={styles.fab}
        onPress={openCreate}
      />

      {/* Form Dialog */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'İndirimi Düzenle' : 'Yeni İndirim'}
      >
        <ScrollView style={styles.dialogScroll}>
          <View style={{ paddingVertical: 8 }}>
            <Input
              label="İndirim Adı *"
              value={form.name}
              onChangeText={(v: string) => setForm({ ...form, name: v })}
              containerStyle={styles.input}
            />
            <Input
              label="Açıklama"
              value={form.description}
              onChangeText={(v: string) => setForm({ ...form, description: v })}
              multiline
              numberOfLines={2}
              containerStyle={styles.input}
            />
            <Input
              label="Kupon Kodu (opsiyonel)"
              value={form.code}
              onChangeText={(v: string) => setForm({ ...form, code: v.toUpperCase() })}
              autoCapitalize="characters"
              containerStyle={styles.input}
            />

            <Text style={styles.sectionLabel}>İndirim Tipi</Text>
            <View style={styles.toggleRow}>
              <Chip
                label="Yüzde (%)"
                selected={form.type === 'percentage'}
                variant={form.type === 'percentage' ? 'primary' : 'neutral'}
                onPress={() => setForm({ ...form, type: 'percentage' })}
              />
              <Chip
                label="Sabit (TL)"
                selected={form.type === 'fixed_amount'}
                variant={form.type === 'fixed_amount' ? 'primary' : 'neutral'}
                onPress={() => setForm({ ...form, type: 'fixed_amount' })}
              />
            </View>

            <Input
              label={`Değer * ${form.type === 'percentage' ? '(%)' : '(TL)'}`}
              value={form.value}
              onChangeText={(v: string) => setForm({ ...form, value: v.replace(',', '.') })}
              keyboardType="numeric"
              containerStyle={styles.input}
            />

            <Text style={styles.sectionLabel}>Kapsam</Text>
            <View style={styles.toggleRow}>
              <Chip
                label="Tüm Mağaza"
                selected={form.scope === 'seller'}
                variant={form.scope === 'seller' ? 'primary' : 'neutral'}
                onPress={() => setForm({ ...form, scope: 'seller', targetProductIds: [] })}
              />
              <Chip
                label="Seçili Ürünler"
                selected={form.scope === 'product'}
                variant={form.scope === 'product' ? 'primary' : 'neutral'}
                onPress={() => setForm({ ...form, scope: 'product' })}
              />
            </View>

            {form.scope === 'product' ? (
              <Pressable
                style={styles.productPickerRow}
                onPress={() => setProductPickerOpen(true)}
              >
                <Ionicons name="cube-outline" size={20} color={colors.primary[600]!} />
                <Text style={styles.productPickerText}>
                  {form.targetProductIds.length > 0
                    ? `${form.targetProductIds.length} ürün seçildi`
                    : 'Ürün seçin'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.text.subtle} />
              </Pressable>
            ) : null}

            <Text style={styles.sectionLabel}>Geçerlilik (YYYY-AA-GG)</Text>
            <View style={styles.dateRow}>
              <Input
                label="Başlangıç"
                value={form.startDate}
                onChangeText={(v: string) => setForm({ ...form, startDate: v })}
                placeholder="2026-04-22"
                containerStyle={styles.dateInput}
              />
              <Input
                label="Bitiş"
                value={form.endDate}
                onChangeText={(v: string) => setForm({ ...form, endDate: v })}
                placeholder="2026-05-22"
                containerStyle={styles.dateInput}
              />
            </View>

            <Text style={styles.sectionLabel}>Limitler (opsiyonel)</Text>
            <Input
              label="Min Sepet Tutarı (TL)"
              value={form.minCartValue}
              onChangeText={(v: string) => setForm({ ...form, minCartValue: v.replace(',', '.') })}
              keyboardType="numeric"
              containerStyle={styles.input}
            />
            <Input
              label="Max İndirim Tutarı (TL)"
              value={form.maxDiscountAmount}
              onChangeText={(v: string) => setForm({ ...form, maxDiscountAmount: v.replace(',', '.') })}
              keyboardType="numeric"
              containerStyle={styles.input}
            />
            <Input
              label="Toplam Kullanım Limiti"
              value={form.usageLimitTotal}
              onChangeText={(v: string) => setForm({ ...form, usageLimitTotal: v.replace(/[^0-9]/g, '') })}
              keyboardType="numeric"
              containerStyle={styles.input}
            />
            <Input
              label="Kullanıcı Başına Limit"
              value={form.usageLimitPerUser}
              onChangeText={(v: string) => setForm({ ...form, usageLimitPerUser: v.replace(/[^0-9]/g, '') || '1' })}
              keyboardType="numeric"
              containerStyle={styles.input}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Birleşebilir İndirim</Text>
              <Switch
                value={form.isStackable}
                onValueChange={(v: boolean) => setForm({ ...form, isStackable: v })}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Aktif</Text>
              <Switch
                value={form.isActive}
                onValueChange={(v: boolean) => setForm({ ...form, isActive: v })}
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.dialogActions}>
          <Button
            variant="ghost"
            title="Vazgeç"
            onPress={() => setFormOpen(false)}
            disabled={saveMutation.isPending}
          />
          <Button
            variant="primary"
            title={form.id ? 'Güncelle' : 'Oluştur'}
            onPress={handleSubmit}
            isLoading={saveMutation.isPending}
            disabled={saveMutation.isPending}
          />
        </View>
      </Modal>

      {/* Product picker */}
      <Modal
        isOpen={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        title="Ürün Seç"
      >
        <ScrollView style={styles.dialogScroll}>
          {productsQuery.isLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Spinner size="lg" />
            </View>
          ) : products.length === 0 ? (
            <Text style={styles.emptyProducts}>Aktif ürününüz yok.</Text>
          ) : (
            products.map((p) => {
              const checked = form.targetProductIds.includes(p.id);
              return (
                <Pressable
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
                    color={checked ? colors.primary[600]! : colors.text.subtle}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.productTitle} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={styles.productPrice}>{formatPrice(p.price)}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
        <View style={styles.dialogActions}>
          <Button variant="primary" title="Tamam" onPress={() => setProductPickerOpen(false)} />
        </View>
      </Modal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={2000}
        variant="success"
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  gateContainer: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  list: {
    flex: 1,
  },
  discountCard: {
    backgroundColor: colors.white,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
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
    color: colors.text.heading,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  codeText: {
    color: colors.primary[600]!,
    fontSize: 12,
    fontWeight: '600',
  },
  valueWrap: {
    alignItems: 'flex-end',
  },
  valueText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  valueLabel: {
    fontSize: 11,
    color: colors.text.muted,
  },
  discountDesc: {
    fontSize: 13,
    color: colors.text.muted,
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
    color: colors.text.muted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
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
    color: colors.text.muted,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  dialogScroll: {
    maxHeight: 460,
  },
  input: {
    marginBottom: 10,
  },
  dateInput: {
    flex: 1,
    marginBottom: 0,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    marginTop: 8,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  productPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface.alt,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  productPickerText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.heading,
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
    color: colors.text.heading,
  },
  emptyProducts: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingVertical: 24,
    fontSize: 14,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
  },
  productPrice: {
    fontSize: 13,
    color: colors.primary[600]!,
    marginTop: 2,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
