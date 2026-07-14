import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { theme, Button, Text } from '@tarodan/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { paymentsApi } from '@/lib/api';

const { colors } = theme;

type TierKey = 'basic' | 'premium' | 'business';

const TIER_NAMES: Record<TierKey, string> = {
  basic: 'Temel',
  premium: 'Premium',
  business: 'Business',
};

type TierFeature = { icon: keyof typeof Ionicons.glyphMap; label: string };

// Kademeye özel başarı özellikleri (checkout MEMBERSHIP_TIERS ile hizalı).
const TIER_FEATURES: Record<TierKey, TierFeature[]> = {
  basic: [
    { icon: 'list', label: '15 ücretsiz ilan' },
    { icon: 'swap-horizontal', label: 'Takas özelliği' },
    { icon: 'albums', label: 'Koleksiyon oluşturma' },
    { icon: 'star', label: '2 öne çıkan ilan' },
  ],
  premium: [
    { icon: 'list', label: '50 ücretsiz ilan' },
    { icon: 'swap-horizontal', label: 'Takas özelliği' },
    { icon: 'albums', label: 'Koleksiyon oluşturma' },
    { icon: 'star', label: '10 öne çıkan ilan' },
    { icon: 'shield-checkmark', label: 'Reklamsız deneyim' },
  ],
  business: [
    { icon: 'list', label: '200 ücretsiz ilan' },
    { icon: 'swap-horizontal', label: 'Takas özelliği' },
    { icon: 'star', label: '50 öne çıkan ilan' },
    { icon: 'code-slash', label: 'API erişimi' },
    { icon: 'ribbon', label: 'Özel satıcı rozeti' },
  ],
};

export default function MembershipSuccessScreen() {
  const { paymentId, tier } = useLocalSearchParams<{ paymentId?: string; tier?: string }>();
  const { refreshUserData } = useAuthStore();
  const queryClient = useQueryClient();

  // `?tier=` paramına göre içeriği kademeye uyarla; bilinmeyen/eksikse premium'a düş.
  const tierKey: TierKey = tier === 'basic' || tier === 'business' ? tier : 'premium';
  const tierName = TIER_NAMES[tierKey];
  const features = TIER_FEATURES[tierKey];

  // PayTR dönüşü sonrası: üyeliği sunucu tarafında KESİNLEŞTİR, sonra yerel
  // kullanıcı + üyelik query'lerini tazele. Callback (ngrok) gecikse/ulaşmasa
  // bile verify (durum-sorgu) ile ödeme işlenir; aksi halde üyelik `past_due`
  // kalır ve "mevcut plan" Temel/ücretsiz görünür (order success ile aynı desen).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (paymentId) {
        // PayTR'ın status-inquiry'si ödeme bittikten birkaç saniye sonra "ödendi"
        // dönebildiği için TEK verify çağrısı erken çalışıp başarısız olabilir. Üyeliği
        // gerçekten aktive eden tek çağrı verify (getStatus sadece DB'yi OKUR, aktive
        // ETMEZ); bu yüzden completed olana kadar verify'i tekrar dene. Aksi halde
        // üyelik past_due kalır ve ilan hakkı 5 (ücretsiz) görünür.
        for (let i = 0; i < 5 && !cancelled; i++) {
          try {
            const res = await paymentsApi.verify(paymentId);
            const completed = (res.data?.data ?? res.data)?.completed;
            if (completed) break;
          } catch { /* best-effort */ }
          if (i < 4 && !cancelled) await new Promise((r) => setTimeout(r, 1200));
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
          {tierName} üyeliğiniz başarıyla aktifleştirildi. Artık tüm özelliklerden yararlanabilirsiniz.
        </Text>

        {/* Features */}
        <View style={styles.features}>
          {features.map((feat) => (
            <View key={feat.label} style={styles.featureItem}>
              <Ionicons name={feat.icon} size={24} color={colors.primary[600]!} />
              <Text style={styles.featureText}>{feat.label}</Text>
            </View>
          ))}
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
    padding: theme.spacing[8],
  },
  iconContainer: {
    marginBottom: theme.spacing[6],
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[3],
  },
  description: {
    fontSize: 15,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing[8],
  },
  features: {
    width: '100%',
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius['3xl'],
    padding: theme.spacing[5],
    marginBottom: theme.spacing[8],
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  featureText: {
    marginLeft: theme.spacing[4],
    fontSize: 15,
    color: colors.text.heading,
    fontWeight: '500',
  },
  buttons: {
    width: '100%',
    gap: theme.spacing[3],
  },
  primaryButton: {
    borderRadius: 12,
  },
  secondaryButton: {
    borderRadius: 12,
    borderColor: colors.primary[600]!,
  },
});
