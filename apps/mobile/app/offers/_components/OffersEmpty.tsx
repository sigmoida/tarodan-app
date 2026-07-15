import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';
import type { TabType } from '../_lib/types';

const { colors } = theme;

export function OffersEmpty({ tab }: { tab: TabType }) {
  const received = tab === 'received';
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={received ? 'mail-open-outline' : 'paper-plane-outline'}
          size={48}
          color={colors.primary[600]!}
        />
      </View>
      <Text style={styles.title}>
        {received ? 'Henüz gelen teklif yok' : 'Henüz gönderilen teklif yok'}
      </Text>
      <Text style={styles.subtitle}>
        {received
          ? 'Alıcılar ilanlarınıza teklif verdiğinde burada görünecek.'
          : 'İlanlara göz atın ve ilk teklifinizi yapın!'}
      </Text>
      <TouchableOpacity style={styles.browseBtn} onPress={() => router.push('/listings')}>
        <Ionicons name="search-outline" size={18} color={colors.white} />
        <Text style={styles.browseBtnText}>İlanlara Göz At</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing[8] },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing[5],
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius['2xl'],
  },
  browseBtnText: { color: colors.white, fontSize: 14, fontWeight: '600' },
});
