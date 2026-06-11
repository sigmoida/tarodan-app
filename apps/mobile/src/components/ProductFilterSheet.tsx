/**
 * Web `apps/web/src/components/SidebarFilters.tsx` paritesi — mobil filtre modalı.
 * Bölümler: Araç Türü, Marka, Model (markaya bağlı), Ölçek, Malzeme, Üretici,
 * Durum, Fiyat, Seçenekler (takas/indirim/ön sipariş/limited/set).
 */
import { useState } from 'react';
import {
  View,
  ScrollView,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Input,
  Radio,
  Text,
  theme,
} from '@tarodan/ui-native';
import type { ProductFilters } from '../utils/productFilters';
import { CONDITION_OPTIONS } from '../utils/productFilters';
import type { ProductFilterOptions } from '../hooks/useProductFilterOptions';

const { colors, spacing } = theme;

type Props = {
  visible: boolean;
  onClose: () => void;
  filters: ProductFilters;
  onChange: (next: ProductFilters) => void;
  onClear: () => void;
  options: ProductFilterOptions;
  resultCount: number;
  countLoading?: boolean;
};

const PRICE_PRESETS: { label: string; min: string; max: string }[] = [
  { label: '₺0-100', min: '0', max: '100' },
  { label: '₺100-500', min: '100', max: '500' },
  { label: '₺500-1K', min: '500', max: '1000' },
  { label: '₺1K+', min: '1000', max: '' },
];

/** Tek-seçim radyo satırı (web'deki radio list görünümü). */
function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.radioRow, selected && styles.radioRowSelected]}
    >
      <Radio checked={selected} onChange={onPress} />
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="label" weight="semibold" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}

export default function ProductFilterSheet({
  visible,
  onClose,
  filters,
  onChange,
  onClear,
  options,
  resultCount,
  countLoading,
}: Props) {
  const [brandSearch, setBrandSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [manufacturerSearch, setManufacturerSearch] = useState('');

  // --- Handlers (web SidebarFilters ile birebir) ---
  const selectCategory = (id: string, name: string) =>
    onChange(
      filters.categoryId === id
        ? { ...filters, categoryId: '', category: '' }
        : { ...filters, categoryId: id, category: name },
    );

  const selectBrand = (id: string, name: string) => {
    const isSel = filters.brandId === id;
    // marka değişince modeli sıfırla (web handleBrandChange)
    onChange(
      isSel
        ? { ...filters, brandId: '', brand: '', carModelId: '', carModel: '' }
        : { ...filters, brandId: id, brand: name, carModelId: '', carModel: '' },
    );
  };

  const selectModel = (id: string, name: string) =>
    onChange(
      filters.carModelId === id
        ? { ...filters, carModelId: '', carModel: '' }
        : { ...filters, carModelId: id, carModel: name },
    );

  const selectManufacturer = (id: string, name: string) =>
    // Üretici değişince üreticiye-özel attribute seçimlerini sıfırla (web ile parite) —
    // başka üreticinin attribute'ları yeni üreticide anlamsız.
    onChange(
      filters.manufacturerId === id
        ? { ...filters, manufacturerId: '', manufacturer: '', customAttributes: {} }
        : { ...filters, manufacturerId: id, manufacturer: name, customAttributes: {} },
    );

  const toggleCustomAttribute = (groupSlug: string, attrSlug: string) => {
    // Her custom attribute grubu tekli seçim: aynı değere tekrar basınca kaldır,
    // farklı değere basınca önceki seçimi değiştir. (web ile parite)
    const current = filters.customAttributes?.[groupSlug] ?? [];
    const isSelected = current.includes(attrSlug);
    const nextMap = { ...(filters.customAttributes ?? {}) };
    if (isSelected) delete nextMap[groupSlug];
    else nextMap[groupSlug] = [attrSlug];
    onChange({ ...filters, customAttributes: nextMap });
  };

  const toggleScale = (scale: string) =>
    onChange({ ...filters, scale: filters.scale === scale ? '' : scale });

  const toggleMaterial = (slug: string) =>
    onChange({ ...filters, material: filters.material === slug ? '' : slug });

  const toggleCondition = (value: string) =>
    onChange({ ...filters, condition: filters.condition === value ? '' : value });

  const lc = (s: string) => s.toLowerCase();
  const filteredBrands = options.brands.filter((b) =>
    lc(b.name).includes(lc(brandSearch)),
  );
  // Model listesi seçili markaya göre daralır (web modelsForBrand)
  const modelsForBrand = options.carModels.filter(
    (m) =>
      (!filters.brandId || m.brandId === filters.brandId) &&
      lc(m.name).includes(lc(modelSearch)),
  );
  const filteredManufacturers = options.manufacturers.filter((m) =>
    lc(m.name).includes(lc(manufacturerSearch)),
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="h2">Filtreler</Text>
          <IconButton icon="close" accessibilityLabel="Kapat" size="md" onPress={onClose} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Arama */}
          <View style={styles.section}>
            <SectionTitle>Arama</SectionTitle>
            <Input
              placeholder="Model, marka veya anahtar kelime..."
              value={filters.search}
              onChangeText={(v) => onChange({ ...filters, search: v })}
              leftIconName="search"
              rightIcon={
                filters.search ? (
                  <Pressable
                    onPress={() => onChange({ ...filters, search: '' })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Aramayı temizle"
                  >
                    <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                  </Pressable>
                ) : undefined
              }
            />
          </View>

          <Divider style={styles.divider} />

          {/* Araç Türü */}
          {options.categories.length > 0 && (
            <View style={styles.section}>
              <SectionTitle>Araç Türü</SectionTitle>
              {options.categories.map((c) => (
                <RadioRow
                  key={c.id}
                  label={c.name}
                  selected={filters.categoryId === c.id}
                  onPress={() => selectCategory(c.id, c.name)}
                />
              ))}
            </View>
          )}

          <Divider style={styles.divider} />

          {/* Marka */}
          <View style={styles.section}>
            <SectionTitle>Marka</SectionTitle>
            <Input
              placeholder="Marka ara..."
              value={brandSearch}
              onChangeText={setBrandSearch}
              leftIconName="search"
            />
            <View style={styles.scrollList}>
              {filteredBrands.slice(0, 40).map((b) => (
                <RadioRow
                  key={b.id}
                  label={b.name}
                  selected={filters.brandId === b.id}
                  onPress={() => selectBrand(b.id, b.name)}
                />
              ))}
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Model (markaya bağlı) */}
          <View style={styles.section}>
            <SectionTitle>Model</SectionTitle>
            {!filters.brandId && (
              <Text variant="caption" tone="muted" style={{ marginBottom: spacing[2] }}>
                Önce marka seçin (ya da tüm modellerde arayın)
              </Text>
            )}
            <Input
              placeholder="Model ara..."
              value={modelSearch}
              onChangeText={setModelSearch}
              leftIconName="search"
            />
            <View style={styles.scrollList}>
              {modelsForBrand.slice(0, 40).map((m) => (
                <RadioRow
                  key={m.id}
                  label={m.name}
                  selected={filters.carModelId === m.id}
                  onPress={() => selectModel(m.id, m.name)}
                />
              ))}
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Ölçek */}
          <View style={styles.section}>
            <SectionTitle>Ölçek</SectionTitle>
            <View style={styles.chipGrid}>
              {options.scales.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  selected={filters.scale === s}
                  onPress={() => toggleScale(s)}
                />
              ))}
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Malzeme */}
          <View style={styles.section}>
            <SectionTitle>Malzeme</SectionTitle>
            <View style={styles.chipGrid}>
              {options.materials.map((m) => (
                <Chip
                  key={m.slug}
                  label={m.label}
                  selected={filters.material === m.slug}
                  onPress={() => toggleMaterial(m.slug)}
                />
              ))}
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Üretici */}
          <View style={styles.section}>
            <SectionTitle>Üretici</SectionTitle>
            <Input
              placeholder="Üretici ara..."
              value={manufacturerSearch}
              onChangeText={setManufacturerSearch}
              leftIconName="search"
            />
            <View style={styles.scrollList}>
              {filteredManufacturers.slice(0, 40).map((m) => (
                <RadioRow
                  key={m.id}
                  label={m.name}
                  selected={filters.manufacturerId === m.id}
                  onPress={() => selectManufacturer(m.id, m.name)}
                />
              ))}
            </View>
          </View>

          {/* Üreticiye-özel filtreler (örn Hot Wheels: Segment, Assortment...).
              Yalnızca attribute-grubu olan bir üretici seçilince dolar. Web SidebarFilters paritesi. */}
          {options.customAttributes.length > 0 && (
            <>
              <Divider style={styles.divider} />
              {options.customAttributes.map((group) => {
                const selected = filters.customAttributes?.[group.slug] ?? [];
                return (
                  <View key={group.slug} style={styles.section}>
                    <SectionTitle>{group.name}</SectionTitle>
                    <View style={styles.scrollList}>
                      {group.attributes.map((attr) => (
                        <RadioRow
                          key={attr.slug}
                          label={attr.label}
                          selected={selected.includes(attr.slug)}
                          onPress={() => toggleCustomAttribute(group.slug, attr.slug)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          <Divider style={styles.divider} />

          {/* Durum */}
          <View style={styles.section}>
            <SectionTitle>Durum</SectionTitle>
            {CONDITION_OPTIONS.map((c) => (
              <RadioRow
                key={c.value}
                label={c.label}
                selected={filters.condition === c.value}
                onPress={() => toggleCondition(c.value)}
              />
            ))}
          </View>

          <Divider style={styles.divider} />

          {/* Fiyat */}
          <View style={styles.section}>
            <SectionTitle>Fiyat Aralığı</SectionTitle>
            <View style={styles.chipGrid}>
              {PRICE_PRESETS.map((p) => {
                const active = filters.minPrice === p.min && filters.maxPrice === p.max;
                return (
                  <Chip
                    key={p.label}
                    label={p.label}
                    selected={active}
                    onPress={() =>
                      onChange(
                        active
                          ? { ...filters, minPrice: '', maxPrice: '' }
                          : { ...filters, minPrice: p.min, maxPrice: p.max },
                      )
                    }
                  />
                );
              })}
            </View>
            <View style={styles.priceRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Min ₺"
                  placeholder="0"
                  keyboardType="numeric"
                  value={filters.minPrice}
                  onChangeText={(v) => onChange({ ...filters, minPrice: v.replace(/[^0-9]/g, '') })}
                />
              </View>
              <Text variant="body" tone="muted" style={styles.priceDash}>
                -
              </Text>
              <View style={{ flex: 1 }}>
                <Input
                  label="Max ₺"
                  placeholder="∞"
                  keyboardType="numeric"
                  value={filters.maxPrice}
                  onChangeText={(v) => onChange({ ...filters, maxPrice: v.replace(/[^0-9]/g, '') })}
                />
              </View>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Seçenekler */}
          <View style={styles.section}>
            <SectionTitle>Seçenekler</SectionTitle>
            <View style={styles.optionRow}>
              <Checkbox
                checked={filters.tradeOnly}
                onChange={(v) => onChange({ ...filters, tradeOnly: v })}
                label="Sadece Takas Yapılabilir"
              />
            </View>
            <View style={styles.optionRow}>
              <Checkbox
                checked={filters.discountOnly}
                onChange={(v) => onChange({ ...filters, discountOnly: v })}
                label="Sadece İndirimli"
              />
            </View>
            <View style={styles.optionRow}>
              <Checkbox
                checked={filters.preOrder}
                onChange={(v) => onChange({ ...filters, preOrder: v })}
                label="Ön Sipariş"
              />
            </View>
            <View style={styles.optionRow}>
              <Checkbox
                checked={filters.limited}
                onChange={(v) => onChange({ ...filters, limited: v })}
                label="Limited Edisyon"
              />
            </View>
            <View style={styles.optionRow}>
              <Checkbox
                checked={filters.set}
                onChange={(v) => onChange({ ...filters, set: v })}
                label="Set / Paket"
              />
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.footer}>
          <Button variant="outline" title="Temizle" onPress={onClear} style={styles.footerBtn} />
          <Button
            variant="primary"
            title={countLoading ? 'Sonuçlar yükleniyor…' : `${resultCount} Sonuç Göster`}
            onPress={onClose}
            style={{ ...styles.footerBtn, flex: 2 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.DEFAULT },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  content: { flex: 1, paddingHorizontal: spacing[4] },
  section: { marginTop: spacing[4] },
  sectionTitle: { marginBottom: spacing[3] },
  divider: { marginTop: spacing[4] },
  scrollList: { marginTop: spacing[2] },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: 8,
  },
  radioRowSelected: { backgroundColor: colors.primary[50]! },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing[3] },
  priceDash: { marginHorizontal: spacing[3], marginBottom: spacing[3] },
  optionRow: { paddingVertical: spacing[2] },
  footer: {
    flexDirection: 'row',
    padding: spacing[4],
    gap: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  footerBtn: { flex: 1, borderRadius: 12 },
});
