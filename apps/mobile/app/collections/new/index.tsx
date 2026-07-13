import { View, ScrollView } from 'react-native';
import { Snackbar, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { useNewCollection } from './_hooks/useNewCollection';
import { styles } from './_lib/styles';
import { PremiumGate, AuthGate } from './_components/NewCollectionGates';
import { NewCollectionForm } from './_components/NewCollectionForm';

export default function NewCollectionScreen() {
  const f = useNewCollection();

  if (!f.canCreateCollections) return <PremiumGate />;
  if (!f.isAuthenticated) return <AuthGate />;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Yeni Koleksiyon"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      <ScrollView style={styles.content}>
        <NewCollectionForm f={f} />
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
