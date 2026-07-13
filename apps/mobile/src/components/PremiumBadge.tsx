import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { theme, Text } from '@tarodan/ui-native';

const { colors } = theme;

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
    color: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  verified: {
    icon: 'checkmark-shield',
    iconType: 'ionicons' as const,
    label: 'Onaylı',
    color: colors.info[600]!,
    backgroundColor: colors.info[50]!,
  },
  premium_verified: {
    icon: 'shield-crown',
    iconType: 'material' as const,
    label: 'Premium Onaylı',
    color: colors.primary[700]!,
    backgroundColor: colors.primary[50]!,
  },
};

const SIZE_CONFIG = {
  small: {
    iconSize: 14,
    fontSize: 10,
    padding: theme.spacing[1],
    borderRadius: theme.radius.xl,
    gap: theme.spacing[0.5],
  },
  medium: {
    iconSize: 18,
    fontSize: 12,
    padding: theme.spacing[1.5],
    borderRadius: theme.radius['2xl'],
    gap: theme.spacing[1],
  },
  large: {
    iconSize: 24,
    fontSize: 14,
    padding: theme.spacing[2],
    borderRadius: 12,
    gap: theme.spacing[1.5],
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
          color={colors.primary[600]!}
          style={styles.inlineIcon}
        />
      )}
      {isVerified && (
        <Ionicons
          name="checkmark-circle"
          size={iconSize}
          color={colors.info[600]!}
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
      color: colors.text.muted,
      icon: 'account',
    },
    basic: {
      name: 'Temel Üye',
      color: colors.info[600]!,
      icon: 'account-check',
    },
    premium: {
      name: 'Premium Üye',
      color: colors.primary[600]!,
      icon: 'crown',
    },
    business: {
      name: 'Kurumsal',
      color: colors.primary[700]!,
      icon: 'domain',
    },
  }[membershipTier];

  return (
    <View style={[styles.cardContainer, { borderColor: colors.border.DEFAULT }]}>
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
            color={colors.success[600]!}
            style={{ marginLeft: theme.spacing[1] }}
          />
        )}
      </View>

      {!isPremium && onUpgrade && (
        <TouchableOpacity style={styles.upgradeLink} onPress={onUpgrade}>
          <Text style={styles.upgradeLinkText}>Yükselt</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary[600]!} />
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
    marginLeft: theme.spacing[1],
  },
  inlineIcon: {
    marginHorizontal: 1,
  },
  cardContainer: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[3],
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    marginLeft: theme.spacing[2],
    fontWeight: '600',
    fontSize: 14,
  },
  upgradeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: theme.spacing[2],
  },
  upgradeLinkText: {
    color: colors.primary[600]!,
    fontWeight: '500',
    fontSize: 12,
  },
});

export default PremiumBadge;
