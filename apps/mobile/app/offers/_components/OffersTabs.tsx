import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';
import type { TabType } from '../_lib/types';

const { colors } = theme;

const TABS: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'received', label: 'Gelen', icon: 'mail-open-outline' },
  { key: 'sent', label: 'Gönderilen', icon: 'paper-plane-outline' },
];

export function OffersTabs({
  activeTab,
  onChange,
}: {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}) {
  return (
    <View style={styles.container}>
      {TABS.map(({ key, label, icon }) => {
        const active = activeTab === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(key)}
          >
            <Ionicons
              name={icon}
              size={18}
              color={active ? colors.primary[600]! : colors.text.subtle}
            />
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface.elevated,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.gray[100]!,
  },
  tabActive: {
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[600]!,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.text.subtle },
  tabTextActive: { color: colors.primary[600]! },
});
