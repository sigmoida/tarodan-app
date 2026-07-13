import { View, ScrollView, RefreshControl } from 'react-native';
import { Button, Spinner, Text, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrderGroup } from './_hooks/useOrderGroup';
import { styles } from './_lib/styles';
import { GroupHeader, GroupOrderRow } from './_components/GroupSections';

const { colors } = theme;

export default function OrderGroupDetailScreen() {
  const f = useOrderGroup();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Sipariş Detayı"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      {f.isLoading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
        </View>
      ) : f.error || !f.group ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.text.subtle} />
          <Text style={styles.errorText}>Sipariş grubu yüklenemedi.</Text>
          <Button variant="primary" title="Tekrar Dene" onPress={() => f.refetch()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          <GroupHeader group={f.group} />
          {f.group.orders.map((order) => (
            <GroupOrderRow key={order.id} order={order} multi={f.group!.orders.length > 1} />
          ))}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}
