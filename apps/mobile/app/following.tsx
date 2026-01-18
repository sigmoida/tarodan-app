import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, Card, Avatar, Button, ActivityIndicator, IconButton } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFollowStore, FollowedSeller } from '../src/stores/followStore';
import { useAuthStore } from '../src/stores/authStore';
import { TarodanColors } from '../src/theme';

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
        <Ionicons name="people-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Takip Ettiklerim</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Satıcıları takip etmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Takip Ettiklerim ({getFollowingCount()})</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      {isLoading && following.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : following.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={80} color={TarodanColors.textLight} />
          <Text variant="titleMedium" style={styles.emptyTitle}>Henüz kimseyi takip etmiyorsunuz</Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            Satıcıları takip ederek yeni ilanlarından haberdar olun
          </Text>
          <Button mode="contained" onPress={() => router.push('/(tabs)/search')}>
            Satıcıları Keşfet
          </Button>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
          }
        >
          {following.map((seller) => (
            <Card key={seller.id} style={styles.sellerCard}>
              <TouchableOpacity onPress={() => router.push(`/seller/${seller.id}`)}>
                <Card.Content style={styles.sellerContent}>
                  {seller.avatarUrl ? (
                    <Avatar.Image size={56} source={{ uri: seller.avatarUrl }} />
                  ) : (
                    <Avatar.Text size={56} label={seller.displayName.charAt(0)} />
                  )}
                  <View style={styles.sellerInfo}>
                    <Text variant="titleSmall">{seller.displayName}</Text>
                    <View style={styles.sellerStats}>
                      <Ionicons name="pricetag" size={14} color={TarodanColors.textSecondary} />
                      <Text style={styles.statText}>{seller.listingCount} ilan</Text>
                      {seller.rating && (
                        <>
                          <Ionicons name="star" size={14} color={TarodanColors.warning} style={{ marginLeft: 12 }} />
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
                      mode="outlined"
                      compact
                      onPress={() => handleUnfollow(seller)}
                    >
                      Takibi Bırak
                    </Button>
                  </View>
                </Card.Content>
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sellerCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  sellerContent: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: TarodanColors.textSecondary,
    fontSize: 12,
  },
  followedDate: {
    color: TarodanColors.textLight,
    fontSize: 11,
    marginTop: 4,
  },
  actions: {
    marginLeft: 8,
  },
});
