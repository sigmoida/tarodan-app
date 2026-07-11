import React from 'react';
import { View } from 'react-native';
import { Avatar, Button, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

import { styles } from '../_lib/styles';
import { BADGE_INFO } from '../_lib/constants';
import type { SellerProfileController } from '../_hooks/useSellerProfile';

const { colors } = theme;

/** Seller header: avatar, name, location, stats, trust badge, badges, bio, message. */
export function SellerProfileCard({ f }: { f: SellerProfileController }) {
  const { seller, products, ratingStats } = f;
  return (
    <View style={styles.profileCard}>
      <Avatar
        size="xl"
        source={seller.avatarUrl}
        name={seller.displayName?.substring(0, 2).toUpperCase() || 'S'}
      />
      <View style={styles.profileNameRow}>
        <Text style={styles.profileName}>{seller.displayName}</Text>
        {seller.isVerified && (
          <Ionicons name="checkmark-circle" size={24} color={colors.warning[500]!} />
        )}
      </View>
      {seller.location && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color={colors.text.muted} />
          <Text style={styles.locationText}>{seller.location}</Text>
        </View>
      )}
      {seller.createdAt ? (
        <Text style={styles.memberSince}>
          Üye: {new Date(seller.createdAt).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
        </Text>
      ) : null}

      {/* Stats Row — web ile parite: stats objesinden */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{seller.stats?.totalListings ?? products.length}</Text>
          <Text style={styles.statLabel}>İlan</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{seller.stats?.totalSales ?? 0}</Text>
          <Text style={styles.statLabel}>Satış</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={styles.ratingValue}>
            <Ionicons name="star" size={18} color={colors.warning[500]!} />
            <Text style={styles.statValue}>
              {(ratingStats?.averageScore ?? ratingStats?.averageRating ?? seller.stats?.averageRating ?? 0).toFixed(1)}
            </Text>
          </View>
          <Text style={styles.statLabel}>
            {(ratingStats?.totalRatings ?? ratingStats?.total ?? seller.stats?.totalRatings ?? 0)} değerlendirme
          </Text>
        </View>
      </View>

      {/* Güven Skoru — web seller sayfası paritesi (premium + görünür; backend null dönerse gizli) */}
      {seller.isPremium && typeof seller.trustScore === 'number' && (
        <View style={styles.trustBadge}>
          <Ionicons name="shield-checkmark" size={14} color={colors.warning[700]!} />
          <Text style={styles.trustBadgeText}>
            Güven Skoru {seller.trustScore}/100
            {seller.trustLevel ? ` · ${seller.trustLevel}` : ''}
          </Text>
        </View>
      )}

      {/* Badges */}
      {seller.badges && seller.badges.length > 0 && (
        <View style={styles.badgesRow}>
          {seller.badges.map((badge: string) => {
            const info = BADGE_INFO[badge];
            if (!info) return null;
            return (
              <View key={badge} style={[styles.badge, { backgroundColor: info.color }]}>
                <Ionicons name={info.icon as any} size={14} color={colors.white} />
                <Text style={styles.badgeText}>{info.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Bio */}
      {seller.bio && <Text style={styles.bio}>{seller.bio}</Text>}

      {/* Follow Button — web seller header paritesi */}
      <Button
        variant={f.isFollowingSeller ? 'secondary' : 'outline'}
        title={f.isFollowingSeller ? 'Takip Ediliyor' : 'Takip Et'}
        onPress={f.handleToggleFollow}
        style={styles.messageButton}
        icon={f.isFollowingSeller ? 'checkmark' : 'person-add-outline'}
        isLoading={f.followBusy}
      />

      {/* Message Button */}
      <Button
        variant="primary"
        title="Mesaj Gönder"
        onPress={f.handleMessage}
        style={styles.messageButton}
        icon="chatbubble-outline"
      />
      {!f.isAuthenticated && (
        <Text style={styles.loginNotice}>
          Mesaj göndermek için üye girişi yapın
        </Text>
      )}
    </View>
  );
}
