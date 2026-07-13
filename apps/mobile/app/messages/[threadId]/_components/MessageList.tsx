import React from 'react';
import { View, FlatList } from 'react-native';
import { Avatar, Spinner, Text } from '@tarodan/ui-native';

import { parseMessageContent } from '@/utils/contentFilter';
import { AppImage } from '@/components/AppImage';
import { styles } from '../_lib/styles';
import { formatTime, getMessageStatus } from '../_lib/helpers';
import type { MessageThreadController } from '../_hooks/useMessageThread';

/**
 * Grouped, date-divided message list with own/other bubbles.
 *
 * Virtualized (#74): the grouped structure is flattened into typed rows
 * (divider + message) and rendered through a FlatList so only on-screen bubbles
 * mount — unbounded chat history no longer mounts every row up front. Auto-scroll
 * keeps the same contract: onContentSizeChange → scrollToEnd (FlatList supports
 * both identically to ScrollView).
 */
type Row =
  | { kind: 'divider'; key: string; date: string }
  | { kind: 'message'; key: string; message: any; isOwn: boolean; showAvatar: boolean };

export function MessageList({ f }: { f: MessageThreadController }) {
  const { user, other } = f;

  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];
    f.groupedMessages.forEach((group, groupIndex) => {
      out.push({ kind: 'divider', key: `divider-${groupIndex}-${group.date}`, date: group.date });
      group.messages.forEach((message, messageIndex) => {
        const isOwn = message.senderId === user?.id;
        const showAvatar =
          !isOwn &&
          (messageIndex === 0 ||
            group.messages[messageIndex - 1]?.senderId !== message.senderId);
        out.push({ kind: 'message', key: message.id, message, isOwn, showAvatar });
      });
    });
    return out;
  }, [f.groupedMessages, user?.id]);

  const renderItem = React.useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'divider') {
        return (
          <View style={styles.dateDivider}>
            <View style={styles.dateDividerLine} />
            <Text style={styles.dateDividerText}>{item.date}</Text>
            <View style={styles.dateDividerLine} />
          </View>
        );
      }

      const { message, isOwn, showAvatar } = item;
      const parsed = parseMessageContent(message.content || '');

      return (
        <View
          style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther]}
        >
          {!isOwn && (
            <View style={styles.avatarPlaceholder}>
              {showAvatar ? (
                <Avatar
                  size="sm"
                  source={other?.avatarUrl || undefined}
                  name={other?.displayName?.charAt(0) || '?'}
                />
              ) : null}
            </View>
          )}

          <View
            style={[styles.messageBubble, isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther]}
          >
            {parsed.images.length > 0 ? (
              <View style={styles.messageImagesWrap}>
                {parsed.images.map((img, idx) => (
                  <AppImage
                    key={`${message.id}-img-${idx}`}
                    source={img}
                    variant="card"
                    style={styles.messageImage}
                    resizeMode="cover"
                  />
                ))}
              </View>
            ) : null}
            {parsed.text ? (
              <Text
                style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}
              >
                {parsed.text}
              </Text>
            ) : null}
            <View style={styles.messageFooter}>
              <Text
                style={[styles.messageTime, isOwn ? styles.messageTimeOwn : styles.messageTimeOther]}
              >
                {formatTime(message.createdAt)}
              </Text>
              {isOwn && (
                <Text
                  style={[
                    styles.messageStatus,
                    message.status === 'read' && styles.messageStatusRead,
                  ]}
                >
                  {getMessageStatus(message.status)}
                </Text>
              )}
            </View>
          </View>
        </View>
      );
    },
    [other?.avatarUrl, other?.displayName],
  );

  if (f.isLoadingMessages && f.messages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
      </View>
    );
  }

  return (
    <FlatList
      ref={f.scrollViewRef}
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      style={[styles.messagesList, !f.isPositioned && styles.messagesListHidden]}
      contentContainerStyle={styles.messagesContent}
      onContentSizeChange={f.handleContentSizeChange}
      ListFooterComponent={<View style={{ height: 20 }} />}
    />
  );
}
