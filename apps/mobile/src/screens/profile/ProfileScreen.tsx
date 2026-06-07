/**
 * Profile Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuthStore } from '../../stores/authStore';
import { userApi } from '../../services/api';

const MenuItem = ({ icon, label, onPress, badge, color = '#212121' }: any) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress}>
    <View style={[styles.menuIconContainer, { backgroundColor: color + '15' }]}>
      <Icon name={icon} size={22} color={color} />
    </View>
    <Text style={styles.menuLabel}>{label}</Text>
    {badge && (
      <View style={styles.menuBadge}>
        <Text style={styles.menuBadgeText}>{badge}</Text>
      </View>
    )}
    <Icon name="chevron-forward" size={20} color="#BDBDBD" />
  </TouchableOpacity>
);

const ProfileScreen = ({ navigation }: any) => {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    let active = true;
    userApi
      .getProfile()
      .then((res) => {
        if (active) setProfile(res.data?.user ?? res.data ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  const tierType = profile?.membership?.tier?.type ?? user?.membership_type ?? 'free';
  const isPremium = profile?.isPremium ?? (tierType !== 'free');
  const tierLabelMap: Record<string, string> = {
    free: 'Ücretsiz Üye',
    basic: 'Temel Üye',
    premium: 'Premium Üye',
    business: 'Kurumsal Üye',
  };
  const membershipLabel = tierLabelMap[tierType] || 'Ücretsiz Üye';
  const stats = profile?.stats;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Icon name="person" size={40} color="#757575" />
        </View>
        <Text style={styles.username}>{user?.username || 'Kullanıcı'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.membershipBadge}>
          <Icon name="star" size={14} color="#FFC107" />
          <Text style={styles.membershipText}>{membershipLabel}</Text>
        </View>
        {isPremium && profile?.trustScore != null && (
          <View style={styles.trustBadge}>
            <Icon name="shield-checkmark" size={14} color="#F59E0B" />
            <Text style={styles.trustText}>
              Güven Skoru {profile.trustScore}/100
              {profile.trustLevel ? ` · ${profile.trustLevel}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats?.totalListings ?? 0}</Text>
          <Text style={styles.statLabel}>İlan</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats?.totalTrades ?? 0}</Text>
          <Text style={styles.statLabel}>Takas</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{(stats?.averageRating ?? 0).toFixed(1)}</Text>
          <Text style={styles.statLabel}>Puan</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <Text style={styles.menuTitle}>Hesabım</Text>
        <MenuItem
          icon="list"
          label="İlanlarım"
          onPress={() => navigation.navigate('MyListings')}
          color="#2196F3"
        />
        <MenuItem
          icon="albums"
          label="Koleksiyonlarım"
          onPress={() => navigation.navigate('MyCollections')}
          color="#9C27B0"
        />
        <MenuItem
          icon="bag-handle"
          label="Siparişlerim"
          onPress={() => navigation.navigate('MyOrders')}
          badge="2"
          color="#4CAF50"
        />
        <MenuItem
          icon="swap-horizontal"
          label="Takaslarım"
          onPress={() => navigation.navigate('Trades', { screen: 'TradesMain' })}
          color="#FF9800"
        />
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.menuTitle}>Üyelik</Text>
        <MenuItem
          icon="diamond"
          label="Üyelik Planları"
          onPress={() => navigation.navigate('Membership')}
          color="#E91E63"
        />
        <MenuItem
          icon="heart"
          label="Favorilerim"
          onPress={() => {}}
          color="#F44336"
        />
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.menuTitle}>Ayarlar</Text>
        <MenuItem
          icon="person-circle"
          label="Profil Düzenle"
          onPress={() => {}}
          color="#607D8B"
        />
        <MenuItem
          icon="notifications"
          label="Bildirim Ayarları"
          onPress={() => {}}
          color="#03A9F4"
        />
        <MenuItem
          icon="shield-checkmark"
          label="Güvenlik"
          onPress={() => {}}
          color="#8BC34A"
        />
        <MenuItem
          icon="help-circle"
          label="Yardım"
          onPress={() => {}}
          color="#00BCD4"
        />
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Icon name="log-out-outline" size={22} color="#F44336" />
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFF',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  username: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
  },
  email: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
  },
  membershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9C4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
  },
  membershipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F9A825',
    marginLeft: 4,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  trustText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
    marginLeft: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    marginTop: 1,
    paddingVertical: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
  },
  statLabel: {
    fontSize: 13,
    color: '#757575',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#EEEEEE',
  },
  menuSection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    fontWeight: '500',
  },
  menuBadge: {
    backgroundColor: '#E53935',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 8,
  },
  menuBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
    marginLeft: 8,
  },
});

export default ProfileScreen;


