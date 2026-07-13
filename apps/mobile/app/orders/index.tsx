import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Button, Spinner, Snackbar, Text, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';

import RatingModal from '@/components/RatingModal';
import { styles } from './_lib/ordersStyles';
import type { Order } from './_lib/ordersStatus';
import { useOrders } from './_hooks/useOrders';
import { OrderCard } from './_components/OrderCard';
import { OrdersGate, OrdersFilters, OrdersEmpty, OrderGroupCard } from './_components/OrdersSections';

const { colors } = theme;

/**
 * Orders (buyer) — THIN screen. The `useOrders` controller owns the grouped/
 * flat query, filter, accordion, rating-modal and snackbar state; this file
 * composes the gate, filters, list (order + group cards), and rating modal.
 */
export default function OrdersScreen() {
  const f = useOrders();

  const gate = OrdersGate({ f });
  if (gate) return gate;

  const onRate = (type: 'product' | 'seller', order: Order) =>
    f.setRatingModal({ visible: true, type, order });

  return (
    <View style={styles.container}>
      <ScreenHeader title="Siparişlerim" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <OrdersFilters f={f} />

      {/* Orders */}
      {f.ordersError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptySubtitle}>
            Siparişler yüklenemedi. Lütfen tekrar deneyin.
          </Text>
          <Button variant="primary" title="Yenile" onPress={() => f.refetch()} style={StyleSheet.flatten([styles.emptyButton, { marginTop: theme.spacing[3] }])} />
        </View>
      ) : f.isLoading && f.entries.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : f.entries.length === 0 ? (
        <OrdersEmpty filter={f.filter} />
      ) : (
        <ScrollView
          style={styles.ordersList}
          refreshControl={
            <RefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {f.entries.map((entry) =>
            entry.kind === 'order' ? (
              <OrderCard key={entry.order.id} order={entry.order} onRate={onRate} />
            ) : (
              <OrderGroupCard
                key={entry.group.id}
                group={entry.group}
                isExpanded={f.expandedGroups.has(entry.group.id)}
                onToggle={() => f.toggleGroup(entry.group.id)}
                onRate={onRate}
              />
            )
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Rating Modal */}
      <RatingModal
        visible={f.ratingModal.visible}
        onDismiss={() => f.setRatingModal({ ...f.ratingModal, visible: false })}
        type={f.ratingModal.type}
        orderId={f.ratingModal.order?.id || ''}
        productId={f.ratingModal.order?.product.id}
        sellerId={f.ratingModal.order?.seller.id}
        productTitle={f.ratingModal.order?.product.title}
        sellerName={f.ratingModal.order?.seller.displayName}
        onSuccess={() => {
          f.refetch();
          f.setSnackbar({
            visible: true,
            variant: 'success',
            message: 'Değerlendirmeniz alındı. Onaylandıktan sonra yayınlanacak.',
          });
        }}
      />

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ visible: false, message: '', variant: 'default' })}
        duration={3500}
        variant={f.snackbar.variant}
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
