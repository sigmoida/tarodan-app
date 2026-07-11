import { useEffect } from 'react';
import { View } from 'react-native';
import { ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';

import { styles } from './_lib/styles';
import { useSecurity } from './_hooks/useSecurity';
import { SecuritySections } from './_components/SecuritySections';
import { SecurityDialogs } from './_components/SecurityDialogs';

/**
 * Security settings — THIN screen. The `useSecurity` controller owns all state,
 * the 2FA/password/phone flows, and the 4 modal-message instances; this file
 * composes the header, the setting cards, and the dialogs.
 */
export default function SecuritySettingsScreen() {
  const f = useSecurity();

  // Yönlendirmeyi render sırasında değil effect'te yap; render içinde router.replace
  // "Cannot update a component while rendering another" uyarısına yol açıyordu.
  useEffect(() => {
    if (!f.isAuthenticated) router.replace('/(auth)/login');
  }, [f.isAuthenticated]);
  if (!f.isAuthenticated) return null;

  return (
    <View style={styles.container}>
      <ScreenHeader title={f.t('mobile.settingsSecurity')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <SecuritySections f={f} />
      <SecurityDialogs f={f} />
    </View>
  );
}
