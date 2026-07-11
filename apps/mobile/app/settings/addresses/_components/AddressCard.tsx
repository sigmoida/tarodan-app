import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, IconButton, Text, theme } from '@tarodan/ui-native';

import { useTranslation } from '@/i18n';
import { styles } from '../_lib/styles';
import type { Address } from '../_lib/types';

const { colors } = theme;

/** A single saved-address card with edit/delete/set-default actions. */
export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  setDefaultPending,
}: {
  address: Address;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  setDefaultPending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card style={styles.addressCard}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Ionicons name="location" size={20} color={colors.primary[600]!} />
          <Text variant="body" style={styles.addressTitle}>{address.title}</Text>
          {address.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>{t('mobile.default')}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardActions}>
          <IconButton icon="pencil" size="sm" accessibilityLabel="Adresi düzenle" onPress={onEdit} />
          <IconButton icon="trash-outline" variant="danger" size="sm" accessibilityLabel="Adresi sil" onPress={onDelete} />
        </View>
      </View>

      <Text variant="body">{address.fullName}</Text>
      <Text variant="bodySm" style={styles.addressDetail}>{address.address}</Text>
      <Text variant="bodySm" style={styles.addressDetail}>
        {address.district}, {address.city} {address.zipCode ?? address.postalCode ?? ''}
      </Text>
      <Text variant="bodySm" style={styles.addressDetail}>Tel: {address.phone}</Text>

      {!address.isDefault && (
        <Button
          variant="ghost"
          size="sm"
          title="Varsayılan Yap"
          onPress={onSetDefault}
          isLoading={setDefaultPending}
          style={styles.defaultButton}
        />
      )}
    </Card>
  );
}
