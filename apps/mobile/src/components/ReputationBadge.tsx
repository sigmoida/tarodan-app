import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Tooltip } from 'react-native-paper';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../theme';

// Reputation levels based on users.txt
export type ReputationLevel = 'rising_star' | 'trusted_seller' | 'elite_collector' | 'hall_of_fame';
export type SpecialRecognition = 'fast_shipper' | 'fair_trader' | 'responsive' | 'collector_expert' | 'community_champion';

interface ReputationBadgeProps {
  level: ReputationLevel;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
}

const REPUTATION_CONFIG: Record<ReputationLevel, {
  icon: string;
  label: string;
  description: string;
  color: string;
  backgroundColor: string;
  criteria: string;
}> = {
  rising_star: {
    icon: 'star-rising',
    label: 'Yükselen Yıldız',
    description: '10-50 başarılı işlem, 4.5+ puan',
    color: '#4CAF50',
    backgroundColor: '#4CAF50' + '15',
    criteria: '10-50 işlem, 4.5+',
  },
  trusted_seller: {
    icon: 'shield-check',
    label: 'Güvenilir Satıcı',
    description: '50-200 başarılı işlem, 4.7+ puan',
    color: '#2196F3',
    backgroundColor: '#2196F3' + '15',
    criteria: '50-200 işlem, 4.7+',
  },
  elite_collector: {
    icon: 'trophy',
    label: 'Elite Koleksiyoner',
    description: '200+ başarılı işlem, 4.8+ puan',
    color: '#9C27B0',
    backgroundColor: '#9C27B0' + '15',
    criteria: '200+ işlem, 4.8+',
  },
  hall_of_fame: {
    icon: 'crown',
    label: 'Şöhretler Salonu',
    description: '500+ işlem, 4.9+ puan, 2+ yıl üyelik',
    color: '#FF9800',
    backgroundColor: '#FF9800' + '15',
    criteria: '500+ işlem, 4.9+, 2+ yıl',
  },
};

const SIZE_CONFIG = {
  small: { iconSize: 16, fontSize: 10, padding: 4 },
  medium: { iconSize: 20, fontSize: 12, padding: 6 },
  large: { iconSize: 28, fontSize: 14, padding: 10 },
};

export const ReputationBadge: React.FC<ReputationBadgeProps> = ({
  level,
  showLabel = true,
  size = 'medium',
  onPress,
}) => {
  const config = REPUTATION_CONFIG[level];
  const sizeConfig = SIZE_CONFIG[size];

  const badgeStyle = [
    styles.badge,
    {
      backgroundColor: config.backgroundColor,
      padding: sizeConfig.padding,
      paddingHorizontal: sizeConfig.padding * 1.5,
    },
  ];

  const content = (
    <>
      <MaterialCommunityIcons
        name={config.icon as any}
        size={sizeConfig.iconSize}
        color={config.color}
      />
      {showLabel && (
        <Text style={[styles.label, { color: config.color, fontSize: sizeConfig.fontSize }]}>
          {config.label}
        </Text>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={badgeStyle} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={badgeStyle}>{content}</View>;
};

// Special Recognition Badges
interface SpecialRecognitionBadgeProps {
  type: SpecialRecognition;
  size?: 'small' | 'medium';
}

const RECOGNITION_CONFIG: Record<SpecialRecognition, {
  icon: string;
  iconType: 'material' | 'ionicons';
  label: string;
  description: string;
  color: string;
}> = {
  fast_shipper: {
    icon: 'rocket',
    iconType: 'ionicons',
    label: 'Hızlı Gönderici',
    description: '95%+ ürünler 24 saat içinde gönderildi',
    color: '#2196F3',
  },
  fair_trader: {
    icon: 'handshake',
    iconType: 'material',
    label: 'Adil Takas',
    description: '90%+ takas memnuniyeti',
    color: '#4CAF50',
  },
  responsive: {
    icon: 'chatbubbles',
    iconType: 'ionicons',
    label: 'Hızlı Yanıt',
    description: 'Ortalama yanıt süresi < 2 saat',
    color: '#9C27B0',
  },
  collector_expert: {
    icon: 'school',
    iconType: 'material',
    label: 'Uzman Koleksiyoner',
    description: 'Belirli marka/kategoride uzmanlaşma',
    color: '#FF9800',
  },
  community_champion: {
    icon: 'people',
    iconType: 'ionicons',
    label: 'Topluluk Şampiyonu',
    description: 'Yüksek topluluk katılımı',
    color: '#E91E63',
  },
};

export const SpecialRecognitionBadge: React.FC<SpecialRecognitionBadgeProps> = ({
  type,
  size = 'small',
}) => {
  const config = RECOGNITION_CONFIG[type];
  const iconSize = size === 'small' ? 14 : 18;

  return (
    <View style={[styles.recognitionBadge, { borderColor: config.color + '40' }]}>
      {config.iconType === 'material' ? (
        <MaterialCommunityIcons name={config.icon as any} size={iconSize} color={config.color} />
      ) : (
        <Ionicons name={config.icon as any} size={iconSize} color={config.color} />
      )}
      <Text style={[styles.recognitionLabel, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
};

// Reputation Score Display
interface ReputationScoreProps {
  rating: number;
  totalReviews: number;
  level?: ReputationLevel;
  specialRecognitions?: SpecialRecognition[];
}

export const ReputationScore: React.FC<ReputationScoreProps> = ({
  rating,
  totalReviews,
  level,
  specialRecognitions = [],
}) => {
  const renderStars = () => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <Ionicons key={i} name="star" size={18} color="#FFD700" />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <Ionicons key={i} name="star-half" size={18} color="#FFD700" />
        );
      } else {
        stars.push(
          <Ionicons key={i} name="star-outline" size={18} color="#FFD700" />
        );
      }
    }
    return stars;
  };

  return (
    <View style={styles.scoreContainer}>
      <View style={styles.scoreHeader}>
        <View style={styles.starsContainer}>{renderStars()}</View>
        <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
        <Text style={styles.reviewCount}>({totalReviews} değerlendirme)</Text>
      </View>

      {level && (
        <View style={styles.levelContainer}>
          <ReputationBadge level={level} size="small" />
        </View>
      )}

      {specialRecognitions.length > 0 && (
        <View style={styles.recognitionsContainer}>
          {specialRecognitions.map((recognition, index) => (
            <SpecialRecognitionBadge key={index} type={recognition} size="small" />
          ))}
        </View>
      )}
    </View>
  );
};

// Rating Breakdown Component (for Product Accuracy, Communication, etc.)
interface RatingBreakdownProps {
  productAccuracy: number;
  communication: number;
  shipping: number;
  tradeFairness?: number;
}

export const RatingBreakdown: React.FC<RatingBreakdownProps> = ({
  productAccuracy,
  communication,
  shipping,
  tradeFairness,
}) => {
  const categories = [
    { label: 'Ürün Doğruluğu', value: productAccuracy, weight: '40%' },
    { label: 'İletişim', value: communication, weight: '20%' },
    { label: 'Kargo', value: shipping, weight: '20%' },
    ...(tradeFairness !== undefined
      ? [{ label: 'Takas Adaleti', value: tradeFairness, weight: '20%' }]
      : []),
  ];

  return (
    <View style={styles.breakdownContainer}>
      {categories.map((category, index) => (
        <View key={index} style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{category.label}</Text>
          <View style={styles.breakdownBarContainer}>
            <View
              style={[
                styles.breakdownBar,
                { width: `${(category.value / 5) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.breakdownValue}>{category.value.toFixed(1)}</Text>
          <Text style={styles.breakdownWeight}>({category.weight})</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    gap: 4,
  },
  label: {
    fontWeight: '600',
  },
  recognitionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: TarodanColors.background,
    marginRight: 6,
    marginBottom: 6,
  },
  recognitionLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  scoreContainer: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
  },
  ratingText: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  reviewCount: {
    marginLeft: 4,
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  levelContainer: {
    marginTop: 8,
  },
  recognitionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  breakdownContainer: {
    paddingVertical: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLabel: {
    width: 100,
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  breakdownBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: TarodanColors.border,
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  breakdownBar: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },
  breakdownValue: {
    width: 30,
    fontSize: 12,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    textAlign: 'right',
  },
  breakdownWeight: {
    width: 40,
    fontSize: 10,
    color: TarodanColors.textSecondary,
    textAlign: 'right',
  },
});

export default ReputationBadge;
