import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Button, Switch, Chip, Input, Text, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import type { DiscountsController } from '../_hooks/useDiscounts';

const { colors } = theme;

/** Create/edit discount form dialog. */
export function DiscountFormModal({ f }: { f: DiscountsController }) {
  const { form, setForm } = f;
  return (
    <Modal
      isOpen={f.formOpen}
      onClose={() => f.setFormOpen(false)}
      title={form.id ? 'İndirimi Düzenle' : 'Yeni İndirim'}
    >
      <ScrollView style={styles.dialogScroll}>
        <View style={{ paddingVertical: theme.spacing[2] }}>
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
              onPress={() => f.setProductPickerOpen(true)}
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
          onPress={() => f.setFormOpen(false)}
          disabled={f.saveMutation.isPending}
        />
        <Button
          variant="primary"
          title={form.id ? 'Güncelle' : 'Oluştur'}
          onPress={f.handleSubmit}
          isLoading={f.saveMutation.isPending}
          disabled={f.saveMutation.isPending}
        />
      </View>
    </Modal>
  );
}
