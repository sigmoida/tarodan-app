import { View, ScrollView, StyleSheet, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  Spinner,
  Text,
  Textarea,
  StatusBadge,
  theme,
  ScreenHeader,
  appAlert,
} from '@tarodan/ui-native';
import type { BadgeVariant } from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supportApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { captureException } from '../../src/services/sentry';

const { colors } = theme;

const ticketStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Açık', variant: 'info' },
  in_progress: { label: 'İnceleniyor', variant: 'warning' },
  waiting_customer: { label: 'Yanıtınız Bekleniyor', variant: 'primary' },
  resolved: { label: 'Çözüldü', variant: 'success' },
  closed: { label: 'Kapatıldı', variant: 'default' },
};

const categoryLabels: Record<string, string> = {
  shipping: 'Sipariş / Kargo',
  payment: 'Ödeme',
  account: 'Hesap',
  product: 'İlan / Ürün',
  trade: 'Takas',
  technical: 'Teknik Sorun',
  other: 'Diğer',
};

interface TicketMessage {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  isInternal?: boolean;
  createdAt?: string;
}

interface TicketDetail {
  id: string;
  ticketNumber?: string;
  creatorId: string;
  subject: string;
  category: string;
  status: string;
  messages?: TicketMessage[];
  createdAt?: string;
}

function formatDate(value?: string): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function SupportTicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [reply, setReply] = useState('');

  const { data: ticket, isLoading, refetch } = useQuery({
    queryKey: ['support-tickets', 'detail', id],
    queryFn: async () => {
      // getTicketById tek bir ticket DTO döndürür → res.data ticket.
      const res: any = await supportApi.getTicket(id as string);
      return (res?.data ?? res) as TicketDetail;
    },
    enabled: isAuthenticated && !!id,
  });

  const replyMutation = useMutation({
    mutationFn: (content: string) => supportApi.addMessage(id as string, { content }),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      refetch();
    },
    onError: (e: any) => {
      captureException(e, { level: 'error', tags: { flow: 'support.ticket.reply' } });
      appAlert('Hata', e?.response?.data?.message || 'Mesaj gönderilemedi, lütfen tekrar deneyin.');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && id) refetch();
    }, [isAuthenticated, id, refetch]),
  );

  if (isLoading && !ticket) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Destek Talebi" onBack={() => (router.canGoBack() ? router.back() : router.replace('/support'))} />
        <View style={styles.loadingContainer}><Spinner size="lg" /></View>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Destek Talebi" onBack={() => (router.canGoBack() ? router.back() : router.replace('/support'))} />
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>Destek talebi bulunamadı</Text>
        </View>
      </View>
    );
  }

  const isClosed = ticket.status === 'closed';
  const messages = (ticket.messages ?? []).filter((m) => !m.isInternal);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Destek Talebi" onBack={() => (router.canGoBack() ? router.back() : router.replace('/support'))} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />}
        >
          {/* Başlık + durum */}
          <Card variant="elevated" style={styles.card}>
            <View style={styles.cardHeader}>
              <Text variant="caption" style={styles.muted}>
                #{ticket.ticketNumber ?? String(ticket.id).slice(0, 8)}
              </Text>
              <StatusBadge status={ticket.status} config={ticketStatusConfig} size="sm" />
            </View>
            <Text variant="h3" style={styles.subject}>{ticket.subject}</Text>
            <Text variant="caption" style={styles.muted}>
              {categoryLabels[ticket.category] ?? ticket.category}
              {ticket.createdAt ? ` · ${formatDate(ticket.createdAt)}` : ''}
            </Text>
          </Card>

          {/* Mesajlar */}
          <View style={styles.messages}>
            {messages.map((message) => {
              const mine = message.senderId === ticket.creatorId;
              return (
                <View key={message.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <View style={styles.bubbleMeta}>
                      <Text variant="caption" style={[styles.bubbleSender, mine && styles.bubbleSenderMine]}>
                        {mine ? 'Siz' : message.senderName || 'Destek Ekibi'}
                      </Text>
                      <Text variant="caption" style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                        {formatDateTime(message.createdAt)}
                      </Text>
                    </View>
                    <Text variant="body" style={mine ? styles.bubbleTextMine : undefined}>
                      {message.content}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Sabit yanıt alanı — ScrollView dışında, ekranın altına sabitlenmiş.
            KeyboardAvoidingView klavye açılınca yukarı iter; insets.bottom home
            indicator boşluğunu bırakır. */}
        {isClosed ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text variant="body" tone="muted" style={styles.closedText}>
              Bu talep kapatılmıştır. Yeni bir sorun için destek talebi oluşturabilirsiniz.
            </Text>
          </View>
        ) : (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Textarea
              label="Yanıtınız"
              value={reply}
              onChangeText={setReply}
              rows={3}
              placeholder="Mesajınızı yazın..."
              style={styles.replyInput}
            />
            <Button
              variant="primary"
              title="Gönder"
              icon="send"
              onPress={() => replyMutation.mutate(reply.trim())}
              isLoading={replyMutation.isPending}
              disabled={replyMutation.isPending || reply.trim().length < 1}
              fullWidth
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  flex: { flex: 1 },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { marginTop: 16 },
  card: { marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  muted: { color: colors.text.muted },
  subject: { marginBottom: 4 },
  messages: { gap: 10, marginBottom: 12 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.primary[600]!, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface.DEFAULT, borderWidth: 1, borderColor: colors.border.DEFAULT, borderBottomLeftRadius: 4 },
  bubbleMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 3 },
  bubbleSender: { color: colors.text.heading, fontWeight: '600' },
  bubbleSenderMine: { color: colors.white },
  bubbleTime: { color: colors.text.muted },
  bubbleTimeMine: { color: colors.white, opacity: 0.8 },
  bubbleTextMine: { color: colors.white },
  closedText: { textAlign: 'center' },
  replyInput: { marginBottom: 12 },
  footer: {
    backgroundColor: colors.surface.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
