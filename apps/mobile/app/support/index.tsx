import { View, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import {
  Button,
  Card,
  Spinner,
  Text,
  StatusBadge,
  theme,
  ScreenHeader,
} from '@tarodan/ui-native';
import type { BadgeVariant } from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supportApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

const { colors } = theme;

// Backend TicketStatus enum'unun TÜM değerleri (web /support ile parite).
// Eksik durum = StatusBadge ham enum gösterir.
const ticketStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Açık', variant: 'info' },
  in_progress: { label: 'İnceleniyor', variant: 'warning' },
  waiting_customer: { label: 'Yanıtınız Bekleniyor', variant: 'primary' },
  resolved: { label: 'Çözüldü', variant: 'success' },
  closed: { label: 'Kapatıldı', variant: 'default' },
};

// Backend TicketCategory enum'u ile birebir.
const categoryLabels: Record<string, string> = {
  shipping: 'Sipariş / Kargo',
  payment: 'Ödeme',
  account: 'Hesap',
  product: 'İlan / Ürün',
  trade: 'Takas',
  technical: 'Teknik Sorun',
  other: 'Diğer',
};

interface TicketSummary {
  id: string;
  ticketNumber?: string;
  subject: string;
  category: string;
  status: string;
  createdAt?: string;
  messageCount?: number;
}

function formatDate(value?: string): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function SupportTicketsScreen() {
  const { isAuthenticated } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['support-tickets', 'me'],
    queryFn: async () => {
      // api interceptor yanıtı unwrap etmez → res.data backend gövdesi.
      // getUserTickets { tickets, total, page, pageSize } döndürür.
      const res: any = await supportApi.getMyTickets({ page: 1, pageSize: 50 });
      const payload = res?.data ?? res;
      const list = payload?.tickets ?? payload?.data ?? (Array.isArray(payload) ? payload : []);
      return list as TicketSummary[];
    },
    enabled: isAuthenticated,
  });

  const tickets = data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Yeni talep oluşturup geri dönünce listeyi tazele.
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) refetch();
    }, [isAuthenticated, refetch]),
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Destek Taleplerim" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={styles.centeredContainer}>
          <Ionicons name="headset-outline" size={64} color={colors.primary[600]!} />
          <Text variant="h2" style={styles.title}>Destek Taleplerim</Text>
          <Text variant="body" tone="muted" style={styles.subtitle}>
            Destek taleplerinizi görmek ve oluşturmak için giriş yapın
          </Text>
          <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Destek Taleplerim" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <View style={styles.newButtonWrap}>
        <Button
          variant="primary"
          title="Yeni Talep Oluştur"
          icon="add"
          onPress={() => router.push('/support/new')}
          fullWidth
        />
      </View>

      {isLoading && tickets.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>Henüz destek talebiniz yok</Text>
          <Text variant="body" tone="muted" style={styles.emptySubtitle}>
            Bir sorununuz olduğunda "Yeni Talep Oluştur" ile bize ulaşabilirsiniz
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {tickets.map((ticket) => (
            <Pressable key={ticket.id} onPress={() => router.push(`/support/${ticket.id}` as any)}>
              <Card variant="elevated" style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text variant="caption" style={styles.muted}>
                    #{ticket.ticketNumber ?? ticket.id.slice(0, 8)}
                  </Text>
                  <StatusBadge status={ticket.status} config={ticketStatusConfig} size="sm" />
                </View>
                <View style={styles.cardBody}>
                  <Text variant="label" numberOfLines={2}>{ticket.subject}</Text>
                  <Text variant="caption" style={styles.muted}>
                    {categoryLabels[ticket.category] ?? ticket.category}
                    {ticket.createdAt ? ` · ${formatDate(ticket.createdAt)}` : ''}
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <Ionicons name="chevron-forward" size={18} color={colors.text.subtle} />
                </View>
              </Card>
            </Pressable>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { marginTop: 16, marginBottom: 8 },
  subtitle: { textAlign: 'center', marginBottom: 24 },
  newButtonWrap: { paddingHorizontal: 16, paddingTop: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { marginTop: 16, marginBottom: 8 },
  emptySubtitle: { textAlign: 'center' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  card: { marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  muted: { color: colors.text.muted },
  cardBody: { gap: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
});
