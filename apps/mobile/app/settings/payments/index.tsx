import { View, ScrollView, RefreshControl } from 'react-native';
import { Chip, Snackbar, Spinner, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { ScreenHeader, EmptyState } from '@/components/common';
import { usePayments } from './_hooks/usePayments';
import { styles } from './_lib/styles';
import { STATUS_OPTIONS } from './_lib/status';
import { PaymentCard } from './_components/PaymentCard';

const { colors } = theme;

export default function PaymentsScreen() {
  const f = usePayments();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ödemelerim" />
        <EmptyState
          icon="lock-closed-outline"
          title="Giriş Gerekli"
          subtitle="Ödeme geçmişinizi görmek için giriş yapın."
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login' as any)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ödemelerim" />

      {/* Status filtresi */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {STATUS_OPTIONS.map((opt) => (
          <Chip
            key={opt.value || 'all'}
            label={opt.label}
            variant="primary"
            selected={f.statusFilter === opt.value}
            onPress={() => f.setStatusFilter(opt.value)}
            style={styles.filterChip}
          />
        ))}
      </ScrollView>

      {f.paymentsQuery.isLoading ? (
        <View style={styles.loading}>
          <Spinner size="lg" />
        </View>
      ) : f.payments.length === 0 ? (
        <EmptyState
          icon="card-outline"
          title="Henüz ödeme yok"
          subtitle={
            f.statusFilter
              ? 'Bu filtreyle eşleşen ödeme bulunamadı.'
              : 'Yaptığınız ödemeler burada listelenecek.'
          }
        />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={f.paymentsQuery.isFetching}
              onRefresh={() => f.paymentsQuery.refetch()}
              colors={[colors.primary[600]!]}
            />
          }
        >
          {f.payments.map((p) => (
            <PaymentCard key={p.id} p={p} f={f} />
          ))}
        </ScrollView>
      )}

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
