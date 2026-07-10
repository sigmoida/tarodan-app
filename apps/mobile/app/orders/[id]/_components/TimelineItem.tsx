import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

const { colors } = theme;

export function TimelineItem({
  icon,
  label,
  date,
  isActive,
  isLast = false,
  testID,
}: {
  icon: string;
  label: string;
  date: string;
  isActive: boolean;
  isLast?: boolean;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.timelineItem}>
      <View style={styles.timelineIcon}>
        <View style={[styles.iconCircle, isActive ? styles.iconCircleActive : styles.iconCircleInactive]}>
          <Ionicons name={icon as any} size={16} color={isActive ? colors.white : colors.text.subtle} />
        </View>
        {!isLast && (
          <View style={[styles.timelineLine, isActive ? styles.timelineLineActive : styles.timelineLineInactive]} />
        )}
      </View>
      <View style={styles.timelineContent}>
        <Text style={isActive ? styles.activeLabel : styles.inactiveLabel}>{label}</Text>
        <Text variant="caption" style={styles.timelineDate}>{date}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timelineItem: { flexDirection: 'row' },
  timelineIcon: { alignItems: 'center', width: 32 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  iconCircleActive: { backgroundColor: colors.primary[600]! },
  iconCircleInactive: { backgroundColor: colors.surface.alt },
  timelineLine: { width: 2, height: 32, marginVertical: 4 },
  timelineLineActive: { backgroundColor: colors.primary[600]! },
  timelineLineInactive: { backgroundColor: colors.surface.alt },
  timelineContent: { flex: 1, marginLeft: 12, paddingBottom: 24 },
  activeLabel: { color: colors.text.heading, fontWeight: '500' },
  inactiveLabel: { color: colors.text.subtle },
  timelineDate: { color: colors.text.muted, marginTop: 2 },
});
