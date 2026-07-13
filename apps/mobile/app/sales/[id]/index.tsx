import { View, ScrollView } from 'react-native';
import { ScreenLoader, ErrorState } from '@tarodan/ui-native';
import { ScreenHeader, ThemedRefreshControl } from '@/components/common';
import { useSaleDetail } from './_hooks/useSaleDetail';
import { styles } from './_lib/styles';
import { SaleDetailBody } from './_components/SaleDetailBody';

export default function SaleDetailScreen() {
  const f = useSaleDetail();

  if (f.isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Sipariş Detayı" />
        <ScreenLoader />
      </View>
    );
  }

  if (f.error || !f.order) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Sipariş Detayı" />
        <ErrorState fullscreen onRetry={() => f.refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Sipariş ${f.order.orderNumber ? '#' + f.order.orderNumber : ''}`.trim()} />
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
      >
        <SaleDetailBody f={f} />
      </ScrollView>
    </View>
  );
}
