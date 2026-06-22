import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, Avatar, Button, Spinner, ScreenHeader } from '@tarodan/ui-native';
import { useFollowStore, FollowedSeller } from '../src/stores/followStore';
import { useAuthStore } from '../src/stores/authStore';

const { colors } = theme;

export default function FollowingScreen() {
  const { isAuthenticated } = useAuthStore();
  const { following, isLoading, fetchFollowing, unfollowSeller, getFollowingCount } = useFollowStore();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch following on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchFollowing();
      }
    }, [isAuthenticated])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFollowing();
    setRefreshing(false);
  };

  const handleUnfollow = async (seller: FollowedSeller) => {
    await unfollowSeller(seller.id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="people-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h2" style={styles.title}>Takip Ettiklerim</Text>
        <Text variant="body" style={styles.subtitle}>
          Satıcıları takip etmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Takip Ettiklerim (${getFollowingCount()})`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {/* Content */}
      {isLoading && following.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : following.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>Henüz kimseyi takip etmiyorsunuz</Text>
          <Text variant="body" style={styles.emptySubtitle}>
            Satıcıları takip ederek yeni ilanlarından haberdar olun
          </Text>
          <Button variant="primary" title="Satıcıları Keşfet" onPress={() => router.push('/(tabs)/search')} style={{ alignSelf: 'center' }} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {following.map((seller) => (
            <Card key={seller.id} padding={0} style={styles.sellerCard}>
              <TouchableOpacity onPress={() => router.push(`/seller/${seller.id}`)}>
                <View style={styles.sellerContent}>
                  <Avatar
                    size="lg"
                    source={seller.avatarUrl}
                    name={seller.displayName}
                  />
                  <View style={styles.sellerInfo}>
                    <Text variant="label">{seller.displayName}</Text>
                    <View style={styles.sellerStats}>
                      <Ionicons name="pricetag" size={14} color={colors.text.muted} />
                      <Text style={styles.statText}>{seller.listingCount} ilan</Text>
                      {seller.rating && (
                        <>
                          <Ionicons name="star" size={14} color={colors.warning[500]!} style={{ marginLeft: 12 }} />
                          <Text style={styles.statText}>{seller.rating.toFixed(1)}</Text>
                        </>
                      )}
                    </View>
                    <Text style={styles.followedDate}>
                      Takip: {formatDate(seller.followedAt)}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Takibi Bırak"
                      onPress={() => handleUnfollow(seller)}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </Card>
          ))}

          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sellerCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  sellerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statText: {
    marginLeft: 4,
    color: colors.text.muted,
    fontSize: 12,
  },
  followedDate: {
    color: colors.text.subtle,
    fontSize: 11,
    marginTop: 4,
  },
  actions: {
    marginLeft: 8,
  },
});
