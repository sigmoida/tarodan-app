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
    padding: 24,
    backgroundColor: colors.surface.alt,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text.heading, marginTop: 16 },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  loginBtnText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  registerLink: { color: colors.primary[600]!, fontSize: 14, fontWeight: '600' },
});
