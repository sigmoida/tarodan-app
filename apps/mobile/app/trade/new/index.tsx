import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ScreenHeader, Snackbar } from '@tarodan/ui-native';

import { styles } from './_lib/styles';
import { useNewTrade } from './_hooks/useNewTrade';
import { NewTradeGate } from './_components/NewTradeGate';
import { StepIndicator, Step1MyItems, Step2TheirItems, Step3Review } from './_components/NewTradeSteps';

/**
 * New trade wizard — THIN screen. The `useNewTrade` controller owns the 3-step
 * state, product queries, and the create-trade mutation; this file renders the
 * gate, step indicator, the active step, and the snackbar.
 */
export default function NewTradeScreen() {
  const f = useNewTrade();

  const gate = NewTradeGate({ f });
  if (gate) return gate;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Takas Teklifi" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <StepIndicator step={f.step} />

      <ScrollView style={styles.content}>
        {f.step === 1 && <Step1MyItems f={f} />}
        {f.step === 2 && <Step2TheirItems f={f} />}
        {f.step === 3 && <Step3Review f={f} />}

        <View style={{ height: 50 }} />
      </ScrollView>

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ ...f.snackbar, visible: false })}
        duration={3000}
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
