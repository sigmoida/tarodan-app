import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, IconButton, Alert as UIAlert, Text, theme } from '@tarodan/ui-native';

import ReportModal from '../../../../src/components/ReportModal';
import { styles } from '../_lib/styles';
import type { MessageThreadController } from '../_hooks/useMessageThread';

const { colors } = theme;

/** Chat header (avatar, name, product), report modal, product banner + alerts. */
export function MessageThreadHeader({ f }: { f: MessageThreadController }) {
  const { other, currentThread } = f;
  return (
    <>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerContent}
          onPress={() => other && router.push(`/seller/${other.id}`)}
        >
          <Avatar
            size="md"
            source={other?.avatarUrl || undefined}
            name={other?.displayName?.charAt(0) || '?'}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{other?.displayName || 'Yükleniyor...'}</Text>
            {currentThread?.product && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {currentThread.product.title}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <IconButton
          icon="ellipsis-vertical"
          accessibilityLabel="Daha fazla"
          size="md"
          onPress={f.handleHeaderMenu}
        />
      </View>

      {other && (
        <ReportModal
          visible={f.showReportModal}
          onDismiss={() => f.setShowReportModal(false)}
          type="user"
          targetId={other.id}
          targetName={other.displayName}
        />
      )}

      {/* Product Banner */}
      {currentThread?.product && (
        <TouchableOpacity
          style={styles.productBanner}
          onPress={() => router.push(`/product/${currentThread.product?.id}`)}
        >
          <Ionicons name="pricetag" size={16} color={colors.primary[600]!} />
          <Text style={styles.productBannerText} numberOfLines={1}>
            {currentThread.product.title}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      )}

      {/* Message Limit Warning */}
      {!f.isUnlimited && !f.canSend && (
        <UIAlert variant="warning">
          Günlük mesaj limitinize ulaştınız ({f.messageLimit} mesaj). Premium üyelikle sınırsız mesaj gönderin.
        </UIAlert>
      )}

      {/* İçerik filtresi uyarısı */}
      {f.filterWarning ? (
        <UIAlert variant="warning">
          {f.filterWarning}
        </UIAlert>
      ) : null}
    </>
  );
}
