import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';

const { colors } = theme;

/** İstatistik kartı — ikon + değer + etiket, opsiyonel dokunma. */
export function StatCard({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string | number;
  color: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.8} disabled={!onPress}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Hızlı işlem butonu — yuvarlak ikon + etiket. */
export function QuickAction({
  icon,
  label,
  onPress,
  color = colors.primary[600]!,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.quickIconWrap, { backgroundColor: color + '20' }]}>
        <MaterialCommunityIcons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}
