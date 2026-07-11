import { View, ScrollView } from 'react-native';
import { Button, FAB, Spinner, Text, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedRefreshControl } from '@/components/common';
import { styles } from './_lib/styles';
import { useAddresses } from './_hooks/useAddresses';
import { AddressCard } from './_components/AddressCard';
import { AddressFormModal } from './_components/AddressFormModal';

const { colors } = theme;

/**
 * Saved addresses — THIN screen. The `useAddresses` controller owns the query,
 * save/delete/set-default mutations, and the form/validation state; this file
 * renders the auth gate, list, FAB, and the add/edit dialog.
 */
export default function AddressesScreen() {
  const f = useAddresses();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="location-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h3" style={styles.title}>{f.t('mobile.settingsAddresses')}</Text>
        <Text variant="body" style={styles.subtitle}>Adreslerinizi görmek için giriş yapın</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={f.t('mobile.settingsAddresses')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={<Text style={styles.headerCount}>{f.addresses.length}/{f.maxAddresses}</Text>}
      />

      {f.isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : f.addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>{f.t('mobile.noSavedAddress')}</Text>
          <Text variant="body" style={styles.emptySubtitle}>Teslimat adresinizi ekleyin</Text>
          <Button variant="primary" title="Adres Ekle" onPress={f.openAddDialog} style={{ alignSelf: 'center' }} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
        >
          {f.addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => f.openEditDialog(address)}
              onDelete={() => f.handleDelete(address)}
              onSetDefault={() => f.setDefaultMutation.mutate(address.id)}
              setDefaultPending={f.setDefaultMutation.isPending && f.setDefaultMutation.variables === address.id}
            />
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* FAB */}
      {f.addresses.length < f.maxAddresses && f.addresses.length > 0 && (
        <FAB
          icon="add"
          accessibilityLabel="Yeni adres ekle"
          style={styles.fab}
          onPress={f.openAddDialog}
        />
      )}

      <AddressFormModal f={f} />
    </View>
  );
}
