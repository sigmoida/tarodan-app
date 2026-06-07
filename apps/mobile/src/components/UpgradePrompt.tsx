import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme, Text, Card, Button, IconButton } from '@tarodan/ui-native';

const { colors } = theme;

type PromptType =
  | 'listingLimit'
  | 'tradeFeature'
  | 'collectionFeature'
  | 'featureListing'
  | 'messageLimit'
  | 'imageLimit';

interface UpgradePromptProps {
  type: PromptType;
  onDismiss?: () => void;
  dismissable?: boolean;
  compact?: boolean;
}

const PROMPT_CONFIG: Record<PromptType, {
  icon: string;
  title: string;
  message: string;
  benefit: string;
}> = {
  listingLimit: {
    icon: 'pricetag',
    title: 'İlan Limitine Ulaştınız',
    message: 'Ücretsiz üye olarak en fazla 10 ilan verebilirsiniz.',
    benefit: 'Premium ile sınırsız ilan verin!',
  },
  tradeFeature: {
    icon: 'swap-horizontal',
    title: 'Takas Özelliği',
    message: 'Takas teklifi yapabilmek için Premium üyelik gerekiyor.',
    benefit: 'Premium ile takas yapın, koleksiyonunuzu büyütün!',
  },
  collectionFeature: {
    icon: 'images',
    title: 'Dijital Garaj',
    message: 'Koleksiyonlarınızı sergilemek için Premium üyelik gerekiyor.',
    benefit: 'Premium ile Dijital Garajınızı oluşturun!',
  },
  featureListing: {
    icon: 'star',
    title: 'Öne Çıkarılan İlanlar',
    message: 'İlanlarınızı öne çıkarmak için Premium üyelik gerekiyor.',
    benefit: 'Premium ile ilanlarınız daha fazla görünsün!',
  },
  messageLimit: {
    icon: 'chatbubble',
    title: 'Günlük Mesaj Limiti',
    message: 'Günlük 50 mesaj limitine ulaştınız.',
    benefit: 'Premium ile sınırsız mesaj gönderin!',
  },
  imageLimit: {
    icon: 'camera',
    title: 'Fotoğraf Limiti',
    message: 'Ücretsiz üye olarak ilana 5 fotoğraf ekleyebilirsiniz.',
    benefit: 'Premium ile 15 fotoğraf yükleyin!',
  },
};

export default function UpgradePrompt({
  type,
  onDismiss,
  dismissable = true,
  compact = false,
}: UpgradePromptProps) {
  const config = PROMPT_CONFIG[type];

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactContainer}
        onPress={() => router.push('/upgrade')}
      >
        <Ionicons name={config.icon as any} size={18} color={colors.primary[600]!} />
        <Text style={styles.compactText}>{config.benefit}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.primary[600]!} />
      </TouchableOpacity>
    );
  }

  return (
    <Card style={styles.card}>
      {dismissable && onDismiss && (
        <IconButton
          icon="close"
          size="sm"
          accessibilityLabel="Kapat"
          style={styles.closeButton}
          onPress={onDismiss}
        />
      )}

      <View style={styles.iconContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name={config.icon as any} size={32} color={colors.primary[600]!} />
        </View>
      </View>

      <Text style={styles.title}>{config.title}</Text>
      <Text style={styles.message}>{config.message}</Text>

      <View style={styles.benefitContainer}>
        <Ionicons name="diamond" size={18} color={colors.primary[600]!} />
        <Text style={styles.benefitText}>{config.benefit}</Text>
      </View>

      <View style={styles.features}>
        <Text style={styles.featuresTitle}>Premium ile:</Text>
        <View style={styles.featureRow}>
          <Ionicons name="checkmark" size={16} color={colors.success[600]!} />
          <Text style={styles.featureText}>Sınırsız ilan</Text>
        </View>
        <View style={styles.featureRow}>
          <Ionicons name="checkmark" size={16} color={colors.success[600]!} />
          <Text style={styles.featureText}>Takas özelliği</Text>
        </View>
        <View style={styles.featureRow}>
          <Ionicons name="checkmark" size={16} color={colors.success[600]!} />
          <Text style={styles.featureText}>Dijital Garaj</Text>
        </View>
        <View style={styles.featureRow}>
          <Ionicons name="checkmark" size={16} color={colors.success[600]!} />
          <Text style={styles.featureText}>Reklamsız deneyim</Text>
        </View>
      </View>

      <Button
        variant="primary"
        title="Premium'a Geç - 99 TL/ay"
        onPress={() => router.push('/upgrade')}
        style={styles.upgradeButton}
      />

      <Text style={styles.priceNote}>
        Yıllık planda 2 ay bedava!
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  closeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    color: colors.text.heading,
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    textAlign: 'center',
    color: colors.text.muted,
    marginBottom: 16,
    fontSize: 14,
  },
  benefitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[50]!,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  benefitText: {
    marginLeft: 8,
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  features: {
    marginBottom: 16,
  },
  featuresTitle: {
    color: colors.text.muted,
    marginBottom: 8,
    fontSize: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  featureText: {
    marginLeft: 8,
    color: colors.text.heading,
    fontSize: 13,
  },
  upgradeButton: {
    backgroundColor: colors.primary[600]!,
  },
  priceNote: {
    textAlign: 'center',
    marginTop: 8,
    color: colors.success[600]!,
    fontSize: 12,
    fontWeight: '500',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50]!,
    padding: 12,
    borderRadius: 8,
    margin: 16,
    gap: 8,
  },
  compactText: {
    flex: 1,
    color: colors.primary[600]!,
    fontWeight: '500',
    fontSize: 13,
  },
});
