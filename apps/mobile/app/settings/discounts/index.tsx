import { View, ScrollView } from 'react-native';
import { Chip, FAB, Snackbar, ScreenHeader, EmptyState, ScreenLoader } from '@tarodan/ui-native';

import { ThemedRefreshControl } from '@/components/common';
import { styles } from './_lib/styles';
import { FILTERS } from './_lib/types';
import { useDiscounts } from './_hooks/useDiscounts';
import { DiscountsGate } from './_components/DiscountsGate';
import { DiscountCard } from './_components/DiscountCard';
import { DiscountFormModal } from './_components/DiscountFormModal';
import { ProductPickerModal } from './_components/ProductPickerModal';

/**
 * Seller discount management — THIN screen. The `useDiscounts` controller owns
 * the queries, filter, form/picker modal state, and save/delete/toggle
 * mutations; this file composes the gate, filter chips, list, FAB, and modals.
 */
export default function DiscountsScreen() {
  const f = useDiscounts();

  const gate = DiscountsGate({ f });
  if (gate) return gate;

  return (
    <View style={styles.container}>
      <ScreenHeader title="İndirimlerim" />

      <View style={styles.filterRow}>
        {FILTERS.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            selected={f.filter === opt.value}
            variant={f.filter === opt.value ? 'primary' : 'neutral'}
            onPress={() => f.setFilter(opt.value)}
          />
        ))}
      </View>

      {f.discountsQuery.isLoading ? (
        <ScreenLoader />
      ) : f.filteredDiscounts.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="Henüz indiriminiz yok"
          subtitle="Mağazanız için ilk indirim kuponunuzu oluşturun."
          actionLabel="Yeni İndirim"
          onAction={f.openCreate}
        />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
        >
          {f.filteredDiscounts.map((d) => (
            <DiscountCard
              key={d.id}
              d={d}
              onToggle={(isActive) => f.toggleActiveMutation.mutate({ id: d.id, isActive })}
              onEdit={() => f.openEdit(d)}
              onDelete={() => f.handleDelete(d)}
            />
          ))}
        </ScrollView>
      )}

      <FAB
        icon="add"
        accessibilityLabel="Yeni indirim oluştur"
        style={styles.fab}
        onPress={f.openCreate}
      />

      <DiscountFormModal f={f} />
      <ProductPickerModal f={f} />

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ visible: false, message: '' })}
        duration={2000}
        variant="success"
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
