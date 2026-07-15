import { View } from 'react-native';
import { Button, Text, theme, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getUpgradeMessage } from '@/utils/membershipLimits';
import { styles } from '../_lib/styles';

const { colors } = theme;

const PREMIUM_FEATURES = [
  'Sınırsız koleksiyon oluşturun',
  'Koleksiyonlarınızı paylaşın',
  'QR kod ve sosyal medya paylaşımı',
  "Koleksiyoncu Vitrini'nde yer alın",
];

/** Premium olmayan kullanıcıya gösterilen yükseltme kapısı. */
export function PremiumGate() {
  const upgradeInfo = getUpgradeMessage('collectionFeature');
  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Dijital Garaj"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
      <View style={styles.premiumRequired}>
        <MaterialCommunityIcons name="garage" size={80} color={colors.primary[600]!} />
        <Text variant="h2" style={styles.premiumTitle}>{upgradeInfo.title}</Text>
        <Text variant="body" style={styles.premiumSubtitle}>{upgradeInfo.message}</Text>

        <View style={styles.premiumFeatures}>
          {PREMIUM_FEATURES.map((feature) => (
            <View key={feature} style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <Button variant="primary" title="Premium'a Yükselt" onPress={() => router.push('/upgrade')} style={styles.upgradeButton} />
        <Button variant="ghost" title="Geri Dön" onPress={() => router.back()} style={{ alignSelf: 'center' }} />
      </View>
    </View>
  );
}

/** Giriş yapmamış kullanıcı kapısı. */
export function AuthGate() {
  return (
    <View style={styles.centeredContainer}>
      <Text variant="h2">Giriş Yapın</Text>
      <Text variant="body" style={styles.subtitle}>
        Koleksiyon oluşturmak için giriş yapmalısınız
      </Text>
      <Button
        variant="primary"
        title="Giriş Yap"
        onPress={() => router.push('/(auth)/login')}
        style={{ alignSelf: 'center' }}
      />
    </View>
  );
}
