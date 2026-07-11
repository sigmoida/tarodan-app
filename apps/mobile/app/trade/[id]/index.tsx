import { View, ScrollView, Clipboard, StyleSheet } from 'react-native';
import { Spinner, Snackbar, ScreenHeader, EmptyState, theme } from '@tarodan/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedRefreshControl } from '@/components/common';
import { useRefresh } from '@/hooks/useRefresh';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { deriveTradeView } from './_lib/derive';
import { useTrade } from './_hooks/useTrade';
import { useCountdown } from './_hooks/useCountdown';
import { useTradeActions } from './_hooks/useTradeActions';
import { TradeStatusHeader } from './_components/TradeStatusHeader';
import { TradeInfoCard } from './_components/TradeInfoCard';
import { TradeItemsCompare } from './_components/TradeItemsCompare';
import { TradeCashCard } from './_components/TradeCashCard';
import { TradeMessages } from './_components/TradeMessages';
import { TradeShippingSection } from './_components/TradeShippingSection';
import { TradeProtectionCard } from './_components/TradeProtectionCard';
import { TradeActions } from './_components/TradeActions';
import { RejectTradeModal } from './_modals/RejectTradeModal';
import { DisputeTradeModal } from './_modals/DisputeTradeModal';

const { colors } = theme;

export default function TradeDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const tradeId = String(id);

  const { data: trade, isLoading, refetch } = useTrade(id as string | undefined);
  const { refreshing, onRefresh } = useRefresh(refetch);
  const now = useCountdown();
  const actions = useTradeActions(tradeId);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Takas Detayı" onBack={handleBack} />
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      </View>
    );
  }

  if (!trade) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Takas Detayı" onBack={handleBack} />
        <EmptyState
          fullscreen
          icon="swap-horizontal-outline"
          title="Takas bulunamadı"
          actionLabel="Geri Dön"
          onAction={handleBack}
        />
      </View>
    );
  }

  const view = deriveTradeView(trade, user);
  const copyCode = (code?: string | null) => {
    if (!code) return;
    Clipboard.setString(code);
    actions.notify('Takip numarası kopyalandı');
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Takas #${trade.tradeNumber}`} onBack={handleBack} />

      <ScrollView
        style={styles.content}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TradeStatusHeader trade={trade} t={t} now={now} />
        <TradeInfoCard trade={trade} isInitiator={view.isInitiator} otherParty={view.otherParty} />
        <TradeItemsCompare
          myItems={view.myItems}
          theirItems={view.theirItems}
          myTotal={view.myTotal}
          theirTotal={view.theirTotal}
          otherPartyName={view.otherParty.displayName}
        />
        <TradeCashCard
          trade={trade}
          userId={user?.id}
          otherPartyName={view.otherParty.displayName}
          cashPaid={view.cashPaid}
          cashCommission={view.cashCommission}
          cashTotal={view.cashTotal}
        />
        <TradeMessages trade={trade} />
        <TradeShippingSection trade={trade} view={view} t={t} onCopy={copyCode} />
        <TradeProtectionCard status={trade.status} />
        <TradeActions
          trade={trade}
          id={tradeId}
          t={t}
          isInitiator={view.isInitiator}
          isReceiver={view.isReceiver}
          userId={user?.id}
          otherPartyId={view.otherParty.id}
          cashPaid={view.cashPaid}
          cashTotal={view.cashTotal}
          cashCommission={view.cashCommission}
          myFromWarehouseStatus={view.myFromWarehouseShipment?.status}
          actions={{
            setTradeAddressId: actions.setTradeAddressId,
            handleAccept: actions.handleAccept,
            acceptPending: actions.acceptPending,
            openReject: actions.reject.open,
            rejectPending: actions.rejectPending,
            handleCancel: actions.handleCancel,
            cancelPending: actions.cancelPending,
            cashPay: actions.cashPay,
            cashPayPending: actions.cashPayPending,
            confirm: actions.confirm,
            confirmPending: actions.confirmPending,
            openDispute: actions.dispute.open,
          }}
        />

        <View style={{ height: 50 }} />
      </ScrollView>

      <RejectTradeModal
        visible={actions.reject.visible}
        onClose={actions.reject.close}
        reason={actions.reject.reason}
        setReason={actions.reject.setReason}
        onSubmit={actions.reject.submit}
        isPending={actions.reject.isPending}
      />

      <DisputeTradeModal
        visible={actions.dispute.visible}
        onClose={actions.dispute.close}
        reason={actions.dispute.reason}
        setReason={actions.dispute.setReason}
        description={actions.dispute.description}
        setDescription={actions.dispute.setDescription}
        onSubmit={actions.dispute.submit}
        isPending={actions.dispute.isPending}
        t={t}
      />

      <Snackbar
        visible={actions.snackbar.visible}
        onDismiss={actions.dismissSnackbar}
        duration={3000}
      >
        {actions.snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.alt },
  container: { flex: 1, backgroundColor: colors.surface.alt },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
});
