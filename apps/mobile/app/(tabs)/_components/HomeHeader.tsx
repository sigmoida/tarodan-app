import React from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import { Input, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from '../_lib/styles';

const { colors } = theme;

const cap = (n: number) => (n > 99 ? '99+' : String(n));

export interface HomeBadgeCounts {
  messageUnreadCount: number;
  unreadCount: number;
  favCount: number;
  cartCount: number;
}

export function HomeHeader({
  searchQuery,
  onChangeSearch,
  onSearch,
  counts,
}: {
  searchQuery: string;
  onChangeSearch: (v: string) => void;
  onSearch: () => void;
  counts: HomeBadgeCounts;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.logoContainer}>
          <Image source={require('../../../assets/tarodan-logo.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/messages')}>
            <Ionicons name="chatbubbles-outline" size={24} color={colors.white} />
            {counts.messageUnreadCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{cap(counts.messageUnreadCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={24} color={colors.white} />
            {counts.unreadCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{cap(counts.unreadCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/collections')}>
            <Ionicons name="albums-outline" size={24} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/favorites')}>
            <Ionicons name="heart-outline" size={24} color={colors.white} />
            {counts.favCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{cap(counts.favCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/cart')}>
            <Ionicons name="cart-outline" size={24} color={colors.white} />
            {counts.cartCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{cap(counts.cartCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <Input
        placeholder="Kategori, ürün, marka, koleksiyon ara"
        value={searchQuery}
        onChangeText={onChangeSearch}
        onSubmitEditing={onSearch}
        leftIconName="search"
        containerStyle={{ marginBottom: 0 }}
      />
    </View>
  );
}
