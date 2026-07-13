import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

/** Giriş yapılmamışsa gösterilen teklif ekranı kapısı. */
export function OffersAuthGate() {
  return (
    <SafeAreaView style={styles.centered}>
      <Ionicons name="pricetag-outline" size={64} color={colors.primary[600]!} />
      <Text style={styles.title}>Tekliflerim</Text>
      <Text style={styles.subtitle}>Tekliflerinizi görmek için giriş yapın</Text>
      <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/(auth)/login')}>
        <Text style={styles.loginBtnText}>Giriş Yap</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
        <Text style={styles.registerLink}>Hesap Oluştur</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: colors.surface.alt,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text.heading, marginTop: theme.spacing[4] },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[6],
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.radius['2xl'],
    marginBottom: theme.spacing[3],
  },
  loginBtnText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  registerLink: { color: colors.primary[600]!, fontSize: 14, fontWeight: '600' },
});
