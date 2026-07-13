import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Button, Spinner, Text, theme } from '@tarodan/ui-native';

import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';
import type { DiscountsController } from '../_hooks/useDiscounts';

const { colors } = theme;

/** Multi-select product picker for product-scoped discounts. */
export function ProductPickerModal({ f }: { f: DiscountsController }) {
  const { form, setForm } = f;
  return (
    <Modal
      isOpen={f.productPickerOpen}
      onClose={() => f.setProductPickerOpen(false)}
      title="Ürün Seç"
    >
      <ScrollView style={styles.dialogScroll}>
        {f.productsQuery.isLoading ? (
          <View style={{ paddingVertical: theme.spacing[6], alignItems: 'center' }}>
            <Spinner size="lg" />
          </View>
        ) : f.products.length === 0 ? (
          <Text style={styles.emptyProducts}>Aktif ürününüz yok.</Text>
        ) : (
          f.products.map((p) => {
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
                <View style={{ flex: 1, marginLeft: theme.spacing[3] }}>
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
        <Button variant="primary" title="Tamam" onPress={() => f.setProductPickerOpen(false)} />
      </View>
    </Modal>
  );
}
