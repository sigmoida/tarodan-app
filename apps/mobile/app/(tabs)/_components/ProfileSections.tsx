import React from 'react';
import { View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Text, theme } from '@tarodan/ui-native';

import { buildAvatarUrl } from '../../../src/services/api';
import { resolveImageUrl } from '../../../src/utils/imageUrl';
import { styles } from '../_lib/profileStyles';
import { quickActionItems, quickActionTint } from '../_lib/profileConstants';
import type { ProfileController } from '../_hooks/useProfile';

const { colors, spacing } = theme;

type SectionProps = { f: ProfileController };

// ---------------------------------------------------------------------------
// Profile card: avatar, name, membership + trust badges, edit button
// ---------------------------------------------------------------------------
export function ProfileCard({ f }: SectionProps) {
  const { user } = f;
  return (
    <View style={styles.profileCard}>
      <Avatar
        size="lg"
        name={user?.displayName || 'U'}
        source={user?.avatar && user?.id ? buildAvatarUrl(String(user.id), user.avatar) : undefined}
      />
      <View style={styles.profileInfo}>
        <Text variant="h3">{user?.displayName}</Text>
        <Text variant="bodySm" tone="muted" style={{ marginTop: 2 }}>
          {user?.email}
        </Text>
        {f.isPaidTier && (
          <View style={styles.membershipBadge}>
            <Ionicons name="diamond" size={14} color={colors.warning[500]!} />
            <Text variant="caption" weight="semibold" style={{ marginLeft: spacing[1] }}>
              {f.tierLabel} Üye
            </Text>
          </View>
        )}
        {f.isPremiumProfile && f.trustScore != null && (
          <View style={styles.trustRow}>
            <View style={styles.trustBadge}>
              <Ionicons name="shield-checkmark" size={13} color={colors.warning[600]!} />
              <Text
                variant="caption"
                weight="semibold"
                style={{ marginLeft: spacing[1], color: colors.warning[700]! }}
              >
                Güven {f.trustScore}/100{f.trustLevel ? ` · ${f.trustLevel}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.trustToggle}
              onPress={() => f.trustVisibilityMutation.mutate(!f.showTrustScore)}
              disabled={f.trustVisibilityMutation.isPending}
            >
              <Ionicons
                name={f.showTrustScore ? 'eye-outline' : 'lock-closed-outline'}
                size={12}
                color={colors.text.muted}
              />
              <Text
                variant="caption"
                style={{ marginLeft: spacing[1], color: colors.text.muted }}
              >
                {f.showTrustScore ? 'Herkese açık' : 'Gizli'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.editButton}
        onPress={() => router.push('/settings/edit-profile')}
      >
        <Ionicons name="pencil" size={18} color={colors.primary[600]!} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stats grid: listings / trades / collections / rating
// ---------------------------------------------------------------------------
export function ProfileStatsGrid({ f }: SectionProps) {
  const { stats } = f;
  return (
    <View style={styles.statsGrid}>
      <TouchableOpacity
        style={styles.statItem}
        onPress={() => router.push('/settings/my-listings')}
      >
        <Text variant="h2" tone="primary">
          {stats?.listings || 0}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
          İlanlarım
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.statItem} onPress={() => router.push('/trades')}>
        <Text variant="h2" tone="primary">
          {stats?.trades || 0}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
          Takaslar
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.statItem}
        onPress={() => router.push('/settings/collections')}
      >
        <Text variant="h2" tone="primary">
          {stats?.collections || 0}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
          Koleksiyon
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.statItem}>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={16} color={colors.warning[500]!} />
          <Text variant="h2" tone="primary" style={{ marginLeft: 4 }}>
            {stats?.rating || '-'}
          </Text>
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
          Puan
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Digital garage: horizontal collection preview or empty CTA
// ---------------------------------------------------------------------------
export function ProfileGarageSection({ f }: SectionProps) {
  const { collectionItems } = f;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="car-sport" size={20} color={colors.primary[600]!} />
          <Text variant="h3" style={{ marginLeft: spacing[2] }}>
            Dijital Garajım
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings/collections')}>
          <Text variant="bodySm" tone="primary" weight="medium">
            Tümünü gör
          </Text>
        </TouchableOpacity>
      </View>
      {collectionItems.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.garageScroll}
        >
          {collectionItems.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.collectionCard}
              onPress={() => router.push(`/collections/${c.id}`)}
            >
              <View style={styles.collectionImageWrap}>
                <Image
                  source={{ uri: resolveImageUrl(c.coverImageUrl ?? c.coverImage) }}
                  style={styles.collectionImage}
                  resizeMode="cover"
                />
                {c.isPublic === false && (
                  <View style={styles.privateBadge}>
                    <Ionicons name="lock-closed" size={12} color={colors.white} />
                  </View>
                )}
              </View>
              <Text variant="label" numberOfLines={1} style={{ marginTop: spacing[2] }}>
                {c.name}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {c.itemCount ?? 0} araç
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.collectionAddCard}
            onPress={() => router.push('/settings/collections')}
          >
            <Ionicons name="add-circle" size={32} color={colors.primary[600]!} />
            <Text variant="caption" tone="primary" weight="medium" style={{ marginTop: spacing[2] }}>
              Yeni
            </Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <TouchableOpacity
          style={styles.garageCard}
          onPress={() => router.push('/settings/collections')}
        >
          <Ionicons name="add-circle" size={40} color={colors.primary[600]!} />
          <Text variant="h3" style={{ marginTop: spacing[3] }}>
            Koleksiyon Oluştur
          </Text>
          <Text variant="bodySm" tone="muted" style={{ marginTop: spacing[1] }}>
            Araçlarını sergile ve paylaş
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quick actions grid (static list)
// ---------------------------------------------------------------------------
export function ProfileQuickActions() {
  return (
    <View style={styles.section}>
      <Text variant="h3">Hızlı Erişim</Text>
      <View style={styles.quickActions}>
        {quickActionItems.map((q) => (
          <TouchableOpacity
            key={q.label}
            testID={q.testID}
            style={styles.quickAction}
            onPress={() => router.push(q.to as never)}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name={q.icon} size={22} color={quickActionTint.fg} />
            </View>
            <Text
              variant="caption"
              tone="muted"
              align="center"
              numberOfLines={2}
              style={styles.quickActionLabel}
            >
              {q.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Menu sections (account/support/info) + logout + delete
// ---------------------------------------------------------------------------
interface MenuItemProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  tone?: 'default' | 'primary';
  rightSlot?: React.ReactNode;
  testID?: string;
}

function MenuItem({ icon, label, onPress, tone = 'default', rightSlot, testID }: MenuItemProps) {
  const labelTone = tone === 'primary' ? 'primary' : 'heading';
  const iconColor = tone === 'primary' ? colors.primary[600]! : colors.text.muted;
  return (
    <TouchableOpacity testID={testID} style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text variant="body" tone={labelTone} style={styles.menuItemText}>
        {label}
      </Text>
      {rightSlot}
      <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
    </TouchableOpacity>
  );
}

export function ProfileMenuSections({ f }: SectionProps) {
  return (
    <>
      <View style={styles.menuSection}>
        <Text variant="overline" tone="muted" style={{ marginBottom: spacing[3] }}>
          Hesap Ayarları
        </Text>

        <MenuItem
          icon="location-outline"
          label="Adreslerim"
          onPress={() => router.push('/settings/addresses')}
        />
        <MenuItem
          icon="card-outline"
          label="Banka Hesabı / IBAN"
          onPress={() => router.push('/settings/bank-account')}
        />
        <MenuItem
          testID="profile-membership-link"
          icon="diamond-outline"
          label="Üyelik Planı"
          onPress={() => router.push('/membership')}
          rightSlot={f.isPaidTier ? <Badge variant="primary">{f.tierLabel}</Badge> : null}
        />
        <MenuItem
          icon="notifications-outline"
          label="Bildirim Ayarları"
          onPress={() => router.push('/settings/notifications')}
        />
        <MenuItem
          icon="shield-checkmark-outline"
          label="Güvenlik"
          onPress={() => router.push('/settings/security')}
        />
        <MenuItem
          testID="profile-language-link"
          icon="language-outline"
          label="Dil / Language"
          onPress={() => router.push('/settings/language')}
        />
        {f.effectiveTier.toLowerCase() === 'business' && (
          <MenuItem
            icon="business-outline"
            label="İşletme Paneli"
            tone="primary"
            onPress={() => router.push('/settings/business')}
            rightSlot={<Badge variant="warning">👑</Badge>}
          />
        )}
        <MenuItem
          icon="stats-chart-outline"
          label="İstatistikler"
          onPress={() => router.push('/settings/analytics')}
        />
      </View>

      <View style={styles.menuSection}>
        <Text variant="overline" tone="muted" style={{ marginBottom: spacing[3] }}>
          Destek
        </Text>
        <MenuItem
          icon="help-circle-outline"
          label="Yardım & SSS"
          onPress={() => router.push('/help')}
        />
        <MenuItem
          icon="headset-outline"
          label="Destek Taleplerim"
          onPress={() => router.push('/support')}
        />
        <MenuItem
          icon="information-circle-outline"
          label="Hakkında"
          onPress={() => router.push('/about')}
        />
      </View>

      <View style={styles.menuSection}>
        <Text variant="overline" tone="muted" style={{ marginBottom: spacing[3] }}>
          Bilgi
        </Text>
        <MenuItem
          icon="shield-checkmark-outline"
          label="Orijinallik Garantisi"
          onPress={() => router.push('/authenticity')}
        />
        <MenuItem
          icon="book-outline"
          label="Koleksiyoner Rehberi"
          onPress={() => router.push('/collectors-guide')}
        />
        <MenuItem
          icon="receipt-outline"
          label="Platform Hizmet Bedeli"
          onPress={() => router.push('/platform-hizmet-bedeli')}
        />
      </View>

      <TouchableOpacity
        testID="profile-logout-button"
        style={styles.logoutButton}
        onPress={f.handleLogout}
      >
        <Ionicons name="log-out-outline" size={22} color={colors.danger[600]!} />
        <Text variant="body" tone="danger" weight="semibold" style={{ marginLeft: spacing[2] }}>
          Çıkış Yap
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        testID="profile-delete-account-button"
        style={styles.deleteAccountButton}
        onPress={f.handleDeleteAccount}
      >
        <Text variant="caption" tone="danger" weight="medium">
          Hesabı Sil
        </Text>
      </TouchableOpacity>
    </>
  );
}
