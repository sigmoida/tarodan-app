import { View } from 'react-native';
import { Snackbar } from '@tarodan/ui-native';

import { ScreenHeader, ScreenLoader, ErrorState } from '../../../../src/components/common';
import { styles } from './_lib/styles';
import { useTradeCounter } from './_hooks/useTradeCounter';
import { TradeCounterBody } from './_components/TradeCounterBody';

/**
 * Counter-offer — THIN screen. The `useTradeCounter` controller owns the trade
 * query, selection state, and counter mutation; this file renders the error/
 * loading gates and delegates the body + snackbar.
 */
export default function TradeCounterScreen() {
  const f = useTradeCounter();

  if (f.tradeQuery.error || (!f.trade && !f.tradeQuery.isLoading)) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Karşı Teklif" onBack={f.handleBack} />
        <ErrorState fullscreen onRetry={() => f.tradeQuery.refetch()} />
      </View>
    );
  }

  if (f.tradeQuery.isLoading || !f.trade || f.initializedId !== f.trade.id) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Karşı Teklif" onBack={f.handleBack} />
        <ScreenLoader />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Karşı Teklif Ver" onBack={f.handleBack} />

      <TradeCounterBody f={f} />

      <Snackbar visible={!!f.snack} onDismiss={() => f.setSnack(null)} duration={2000}>
        {f.snack || ''}
      </Snackbar>
    </View>
  );
}
