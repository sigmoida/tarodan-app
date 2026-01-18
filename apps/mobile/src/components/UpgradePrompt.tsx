import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card, Button, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TarodanColors } from '../theme';

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
        <Ionicons name={config.icon as any} size={18} color={TarodanColors.primary} />
        <Text style={styles.compactText}>{config.benefit}</Text>
        <Ionicons name="chevron-forward" size={18} color={TarodanColors.primary} />
      </TouchableOpacity>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content>
        {dismissable && onDismiss && (
          <IconButton
            icon="close"
            size={20}
            style={styles.closeButton}
            onPress={onDismiss}
          />
        )}
        
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name={config.icon as any} size={32} color={TarodanColors.primary} />
          </View>
        </View>

        <Text variant="titleMedium" style={styles.title}>{config.title}</Text>
        <Text variant="bodyMedium" style={styles.message}>{config.message}</Text>
        
        <View style={styles.benefitContainer}>
          <Ionicons name="diamond" size={18} color={TarodanColors.primary} />
          <Text style={styles.benefitText}>{config.benefit}</Text>
        </View>

        <View style={styles.features}>
          <Text variant="bodySmall" style={styles.featuresTitle}>Premium ile:</Text>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark" size={16} color={TarodanColors.success} />
            <Text style={styles.featureText}>Sınırsız ilan</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark" size={16} color={TarodanColors.success} />
            <Text style={styles.featureText}>Takas özelliği</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark" size={16} color={TarodanColors.success} />
            <Text style={styles.featureText}>Dijital Garaj</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark" size={16} color={TarodanColors.success} />
            <Text style={styles.featureText}>Reklamsız deneyim</Text>
          </View>
        </View>

        <Button 
          mode="contained" 
          onPress={() => router.push('/upgrade')}
          style={styles.upgradeButton}
        >
          Premium'a Geç - 99 TL/ay
        </Button>

        <Text style={styles.priceNote}>
          Yıllık planda 2 ay bedava!
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    backgroundColor: TarodanColors.background,
    borderWidth: 1,
    borderColor: TarodanColors.primary + '30',
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
    backgroundColor: TarodanColors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    color: TarodanColors.textPrimary,
  },
  message: {
    textAlign: 'center',
    color: TarodanColors.textSecondary,
    marginBottom: 16,
  },
  benefitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TarodanColors.primary + '10',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  benefitText: {
    marginLeft: 8,
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  features: {
    marginBottom: 16,
  },
  featuresTitle: {
    color: TarodanColors.textSecondary,
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  featureText: {
    marginLeft: 8,
    color: TarodanColors.textPrimary,
    fontSize: 13,
  },
  upgradeButton: {
    backgroundColor: TarodanColors.primary,
  },
  priceNote: {
    textAlign: 'center',
    marginTop: 8,
    color: TarodanColors.success,
    fontSize: 12,
    fontWeight: '500',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.primary + '10',
    padding: 12,
    borderRadius: 8,
    margin: 16,
    gap: 8,
  },
  compactText: {
    flex: 1,
    color: TarodanColors.primary,
    fontWeight: '500',
    fontSize: 13,
  },
});
