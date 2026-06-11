import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { theme, Button, Text } from '@tarodan/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../src/stores/authStore';
import { paymentsApi } from '../../src/services/api';

const { colors } = theme;

export default function MembershipSuccessScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const { refreshUserData } = useAuthStore();
  const queryClient = useQueryClient();

  // PayTR dönüşü sonrası: üyeliği sunucu tarafında KESİNLEŞTİR, sonra yerel
  // kullanıcı + üyelik query'lerini tazele. Callback (ngrok) gecikse/ulaşmasa
  // bile verify (durum-sorgu) ile ödeme işlenir; aksi halde üyelik `past_due`
  // kalır ve "mevcut plan" Temel/ücretsiz görünür (order success ile aynı desen).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (paymentId) {
        try { await paymentsApi.verify(paymentId); } catch { /* best-effort */ }
        // Aktivasyon (past_due → active) işlenene kadar kısa süre yokla.
        for (let i = 0; i < 4 && !cancelled; i++) {
          try {
            const res = await paymentsApi.getStatus(paymentId);
            const status = (res.data?.data ?? res.data)?.status;
            if (status === 'paid' || status === 'completed' || status === 'success') break;
          } catch { /* yoksay */ }
          if (i < 3 && !cancelled) await new Promise((r) => setTimeout(r, 1200));
        }
      }
      if (cancelled) return;
      await refreshUserData?.();
      // Tüm üyelik query'lerini tazele (profil rozeti ['membership-me'] kullanır).
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      queryClient.invalidateQueries({ queryKey: ['membership-me'] });
    };
    run();
    return () => { cancelled = true; };
  }, [paymentId, refreshUserData, queryClient]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color={colors.success[600]!} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Üyelik Aktif!</Text>

        {/* Description */}
        <Text style={styles.description}>
          Premium üyeliğiniz başarıyla aktifleştirildi. Artık tüm özelliklerden yararlanabilirsiniz.
        </Text>

        {/* Features */}
        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="infinite" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Sınırsız İlan</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="swap-horizontal" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Takas Özelliği</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="car-sport" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Digital Garage</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="star" size={24} color={colors.primary[600]!} />
            <Text style={styles.featureText}>Öne Çıkan İlanlar</Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <Button
            variant="primary"
            title="Ana Sayfaya Git"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
            style={styles.primaryButton}
          />
          <Button
            variant="outline"
            title="İlanlarımı Gör"
            fullWidth
            onPress={() => router.push('/settings/my-listings')}
            style={styles.secondaryButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  features: {
    width: '100%',
    backgroundColor: colors.surface.alt,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureText: {
    marginLeft: 16,
    fontSize: 15,
    color: colors.text.heading,
    fontWeight: '500',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 12,
  },
  secondaryButton: {
    borderRadius: 12,
    borderColor: colors.primary[600]!,
  },
});
