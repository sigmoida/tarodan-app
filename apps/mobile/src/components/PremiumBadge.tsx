import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../theme';

export type BadgeType = 'premium' | 'verified' | 'premium_verified';
export type BadgeSize = 'small' | 'medium' | 'large';

interface PremiumBadgeProps {
  type: BadgeType;
  size?: BadgeSize;
  showLabel?: boolean;
  onPress?: () => void;
}

const BADGE_CONFIG = {
  premium: {
    icon: 'crown',
    iconType: 'material' as const,
    label: 'Premium',
    color: TarodanColors.primary,
    backgroundColor: TarodanColors.primary + '15',
  },
  verified: {
    icon: 'checkmark-shield',
    iconType: 'ionicons' as const,
    label: 'Onaylı',
    color: TarodanColors.info,
    backgroundColor: TarodanColors.info + '15',
  },
  premium_verified: {
    icon: 'shield-crown',
    iconType: 'material' as const,
    label: 'Premium Onaylı',
    color: '#9C27B0', // Purple for elite status
    backgroundColor: '#9C27B0' + '15',
  },
};

const SIZE_CONFIG = {
  small: {
    iconSize: 14,
    fontSize: 10,
    padding: 4,
    borderRadius: 8,
    gap: 2,
  },
  medium: {
    iconSize: 18,
    fontSize: 12,
    padding: 6,
    borderRadius: 10,
    gap: 4,
  },
  large: {
    iconSize: 24,
    fontSize: 14,
    padding: 8,
    borderRadius: 12,
    gap: 6,
  },
};

export const PremiumBadge: React.FC<PremiumBadgeProps> = ({
  type,
  size = 'medium',
  showLabel = true,
  onPress,
}) => {
  const config = BADGE_CONFIG[type];
  const sizeConfig = SIZE_CONFIG[size];

  const containerStyle = [
    styles.container,
    {
      backgroundColor: config.backgroundColor,
      paddingHorizontal: sizeConfig.padding * 1.5,
      paddingVertical: sizeConfig.padding,
      borderRadius: sizeConfig.borderRadius,
      gap: sizeConfig.gap,
    },
  ];

  const content = (
    <>
      {config.iconType === 'material' ? (
        <MaterialCommunityIcons
          name={config.icon as any}
          size={sizeConfig.iconSize}
          color={config.color}
        />
      ) : (
        <Ionicons
          name={config.icon as any}
          size={sizeConfig.iconSize}
          color={config.color}
        />
      )}
      {showLabel && (
        <Text
          style={[
            styles.label,
            { color: config.color, fontSize: sizeConfig.fontSize },
          ]}
        >
          {config.label}
        </Text>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={containerStyle} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={containerStyle}>{content}</View>;
};

// Inline badge for text (like next to username)
interface InlinePremiumBadgeProps {
  isPremium?: boolean;
  isVerified?: boolean;
  size?: 'small' | 'medium';
}

export const InlinePremiumBadge: React.FC<InlinePremiumBadgeProps> = ({
  isPremium = false,
  isVerified = false,
  size = 'small',
}) => {
  const iconSize = size === 'small' ? 14 : 18;

  if (!isPremium && !isVerified) return null;

  return (
    <View style={styles.inlineContainer}>
      {isPremium && (
        <MaterialCommunityIcons
          name="crown"
          size={iconSize}
          color={TarodanColors.primary}
          style={styles.inlineIcon}
        />
      )}
      {isVerified && (
        <Ionicons
          name="checkmark-circle"
          size={iconSize}
          color={TarodanColors.info}
          style={styles.inlineIcon}
        />
      )}
    </View>
  );
};

// Premium member card badge (for profile headers)
interface MembershipBadgeCardProps {
  membershipTier: 'free' | 'basic' | 'premium' | 'business';
  isVerified?: boolean;
  onUpgrade?: () => void;
}

export const MembershipBadgeCard: React.FC<MembershipBadgeCardProps> = ({
  membershipTier,
  isVerified = false,
  onUpgrade,
}) => {
  const isPremium = membershipTier === 'premium' || membershipTier === 'business';

  const tierInfo = {
    free: {
      name: 'Ücretsiz Üye',
      color: TarodanColors.textSecondary,
      icon: 'account',
    },
    basic: {
      name: 'Temel Üye',
      color: TarodanColors.info,
      icon: 'account-check',
    },
    premium: {
      name: 'Premium Üye',
      color: TarodanColors.primary,
      icon: 'crown',
    },
    business: {
      name: 'Kurumsal',
      color: '#9C27B0',
      icon: 'domain',
    },
  }[membershipTier];

  return (
    <View style={[styles.cardContainer, { borderColor: tierInfo.color + '40' }]}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons
          name={tierInfo.icon as any}
          size={24}
          color={tierInfo.color}
        />
        <Text style={[styles.cardTitle, { color: tierInfo.color }]}>
          {tierInfo.name}
        </Text>
        {isVerified && (
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={TarodanColors.success}
            style={{ marginLeft: 4 }}
          />
        )}
      </View>
      
      {!isPremium && onUpgrade && (
        <TouchableOpacity style={styles.upgradeLink} onPress={onUpgrade}>
          <Text style={styles.upgradeLinkText}>Yükselt</Text>
          <Ionicons name="chevron-forward" size={16} color={TarodanColors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
  },
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  inlineIcon: {
    marginHorizontal: 1,
  },
  cardContainer: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 14,
  },
  upgradeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  upgradeLinkText: {
    color: TarodanColors.primary,
    fontWeight: '500',
    fontSize: 12,
  },
});

export default PremiumBadge;
