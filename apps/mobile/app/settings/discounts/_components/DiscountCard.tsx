import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, IconButton, Switch, Text, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import { formatDate, valueLabel, type Discount } from '../_lib/types';

const { colors } = theme;

/** A single discount card: header, meta, active toggle, edit/delete actions. */
export function DiscountCard({
  d,
  onToggle,
  onEdit,
  onDelete,
}: {
  d: Discount;
  onToggle: (isActive: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card style={styles.discountCard}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.discountName}>{d.name}</Text>
          {d.code ? (
            <View style={styles.codeBadge}>
              <Ionicons name="pricetag" size={12} color={colors.primary[600]!} />
              <Text style={styles.codeText}>{d.code}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.valueWrap}>
          <Text style={styles.valueText}>{valueLabel(d)}</Text>
          <Text style={styles.valueLabel}>İndirim</Text>
        </View>
      </View>

      {d.description ? <Text style={styles.discountDesc}>{d.description}</Text> : null}

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="layers-outline" size={14} color={colors.text.muted} />
          <Text style={styles.metaText}>
            {d.scope === 'product' ? 'Seçili Ürünler' : 'Tüm Mağaza'}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
          <Text style={styles.metaText}>
            {formatDate(d.startDate)} - {formatDate(d.endDate)}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="people-outline" size={14} color={colors.text.muted} />
          <Text style={styles.metaText}>
            {d.usedCount} / {d.usageLimitTotal ?? '∞'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.activeRow}>
          <Switch value={d.isActive} onValueChange={(v: boolean) => onToggle(v)} />
          <Text style={styles.activeLabel}>{d.isActive ? 'Aktif' : 'Pasif'}</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <IconButton
            icon="pencil"
            size="sm"
            accessibilityLabel="İndirimi düzenle"
            onPress={onEdit}
          />
          <IconButton
            icon="trash-outline"
            variant="danger"
            size="sm"
            accessibilityLabel="İndirimi sil"
            onPress={onDelete}
          />
        </View>
      </View>
    </Card>
  );
}
