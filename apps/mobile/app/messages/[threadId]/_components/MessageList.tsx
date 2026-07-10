import React from 'react';
import { View, ScrollView, Image as RNImage } from 'react-native';
import { Avatar, Spinner, Text } from '@tarodan/ui-native';

import { parseMessageContent } from '../../../../src/utils/contentFilter';
import { resolveImageUrl } from '../../../../src/utils/imageUrl';
import { styles } from '../_lib/styles';
import { formatTime, getMessageStatus } from '../_lib/helpers';
import type { MessageThreadController } from '../_hooks/useMessageThread';

/** Grouped, date-divided message list with own/other bubbles. */
export function MessageList({ f }: { f: MessageThreadController }) {
  const { user, other } = f;

  if (f.isLoadingMessages && f.messages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
      </View>
    );
  }

  return (
    <ScrollView
      ref={f.scrollViewRef}
      style={[styles.messagesList, !f.isPositioned && styles.messagesListHidden]}
      contentContainerStyle={styles.messagesContent}
      onContentSizeChange={f.handleContentSizeChange}
    >
      {f.groupedMessages.map((group, groupIndex) => (
        <View key={groupIndex}>
          {/* Date Divider */}
          <View style={styles.dateDivider}>
            <View style={styles.dateDividerLine} />
            <Text style={styles.dateDividerText}>{group.date}</Text>
            <View style={styles.dateDividerLine} />
          </View>

          {/* Messages for this date */}
          {group.messages.map((message, messageIndex) => {
            const isOwn = message.senderId === user?.id;
            const showAvatar = !isOwn && (
              messageIndex === 0 ||
              group.messages[messageIndex - 1]?.senderId !== message.senderId
            );

            return (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  isOwn ? styles.messageRowOwn : styles.messageRowOther,
                ]}
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

                <View style={[
                  styles.messageBubble,
                  isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
                ]}>
                  {(() => {
                    const parsed = parseMessageContent(message.content || '');
                    return (
                      <>
                        {parsed.images.length > 0 ? (
                          <View style={styles.messageImagesWrap}>
                            {parsed.images.map((img, idx) => (
                              <RNImage
                                key={`${message.id}-img-${idx}`}
                                source={{ uri: resolveImageUrl(img) }}
                                style={styles.messageImage}
                                resizeMode="cover"
                              />
                            ))}
                          </View>
                        ) : null}
                        {parsed.text ? (
                          <Text style={[
                            styles.messageText,
                            isOwn ? styles.messageTextOwn : styles.messageTextOther,
                          ]}>
                            {parsed.text}
                          </Text>
                        ) : null}
                      </>
                    );
                  })()}
                  <View style={styles.messageFooter}>
                    <Text style={[
                      styles.messageTime,
                      isOwn ? styles.messageTimeOwn : styles.messageTimeOther,
                    ]}>
                      {formatTime(message.createdAt)}
                    </Text>
                    {isOwn && (
                      <Text style={[
                        styles.messageStatus,
                        message.status === 'read' && styles.messageStatusRead,
                      ]}>
                        {getMessageStatus(message.status)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}
