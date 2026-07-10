import { View, ScrollView } from 'react-native';
import { Snackbar, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';

import { styles } from './_lib/styles';
import { useHelp } from './_hooks/useHelp';
import { HelpFaq } from './_components/HelpFaq';
import { HelpContact } from './_components/HelpContact';

/**
 * Help center — THIN screen. The `useHelp` controller owns the FAQ search/
 * accordion state, contact form + validation + submit, and snackbar; this file
 * composes the FAQ and contact sections.
 */
export default function HelpScreen() {
  const f = useHelp();

  return (
    <View style={styles.container}>
      <ScreenHeader title={f.t('mobile.pageHelpCenter')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <HelpFaq f={f} />
        <HelpContact f={f} />

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={f.snackbarVisible}
        onDismiss={() => f.setSnackbarVisible(false)}
        duration={3000}
        variant={f.snackbarVariant}
      >
        {f.snackbarMessage}
      </Snackbar>
    </View>
  );
}
