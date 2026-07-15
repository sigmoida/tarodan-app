import { View, TouchableOpacity } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';
import { StatCard, QuickAction } from './DashboardPrimitives';
import type { SellerDashboardController } from '../_hooks/useSellerDashboard';

const { colors } = theme;

/** Karşılama kartı — kurumsal/bireysel mesaj + yükselt butonu. */
export function WelcomeCard({ f }: { f: SellerDashboardController }) {
  return (
    <View style={styles.welcomeCard}>
      <MaterialCommunityIcons name="storefront" size={28} color={colors.primary[600]!} />
      <View style={{ flex: 1 }}>
        <Text style={styles.welcomeTitle}>{f.isBusiness ? 'Kurumsal Satıcı Paneli' : 'Hoş Geldin!'}</Text>
        <Text style={styles.welcomeSubtitle}>
          {f.isBusiness
            ? 'İşletme hesabınla satış yapıyorsun.'
            : 'Daha fazla avantaj için işletme hesabına yükselebilirsin.'}
        </Text>
      </View>
      {!f.isBusiness ? (
        <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/seller/register')}>
          <Text style={styles.upgradeBtnText}>Yükselt</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** 4'lü istatistik grid'i. */
export function StatsGrid({ f }: { f: SellerDashboardController }) {
  return (
    <View style={styles.statsGrid}>
      <StatCard
        icon="pricetag"
        label="Aktif İlan"
        value={f.activeListings}
        color={colors.primary[600]!}
        onPress={() => router.push('/settings/my-listings')}
      />
      <StatCard
        icon="cube"
        label="Bekleyen Sipariş"
        value={f.pendingOrders}
        color={colors.warning[600]!}
        onPress={() => router.push('/sales')}
      />
      <StatCard icon="cash" label="Bu Ay Satış" value={formatPrice(f.monthly)} color={colors.success[600]!} />
      <StatCard
        icon="star"
        label="Puan"
        value={f.rating > 0 ? f.rating.toFixed(1) : '—'}
        color={colors.warning[500]!}
      />
    </View>
  );
}

/** Hızlı işlemler kartı. */
export function QuickActions() {
  return (
    <Card style={styles.actionsCard}>
      <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>
      <View style={styles.quickGrid}>
        <QuickAction icon="plus-circle-outline" label="Yeni İlan" onPress={() => router.push('/(tabs)/sell')} color={colors.primary[600]!} />
        <QuickAction icon="format-list-bulleted" label="İlanlarım" onPress={() => router.push('/settings/my-listings')} color={colors.info[600]!} />
        <QuickAction icon="cube-send" label="Satışlarım" onPress={() => router.push('/sales')} color={colors.warning[500]!} />
        <QuickAction icon="chart-line" label="Analitik" onPress={() => router.push('/settings/analytics')} color={colors.warning[500]!} />
        <QuickAction icon="message-text-outline" label="Mesajlar" onPress={() => router.push('/(tabs)/messages')} color={colors.info[600]!} />
        <QuickAction icon="account-cog-outline" label="İşletme Bilgileri" onPress={() => router.push('/seller/register')} color={colors.gray[200]} />
      </View>
    </Card>
  );
}

/** Toplam özet kartı — veri varsa render edilir (self-gate). */
export function SummaryCard({ f }: { f: SellerDashboardController }) {
  const { stats } = f;
  if (!(stats.totalListings || stats.totalOrders)) return null;

  return (
    <Card style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>Toplam Özet</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Toplam İlan</Text>
        <Text style={styles.summaryValue}>{stats.totalListings ?? 0}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Toplam Sipariş</Text>
        <Text style={styles.summaryValue}>{stats.totalOrders ?? 0}</Text>
      </View>
      {stats.totalSales ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Toplam Satış</Text>
          <Text style={[styles.summaryValue, { color: colors.primary[600]! }]}>
            {formatPrice(stats.totalSales)}
          </Text>
        </View>
      ) : null}
      {stats.ratingCount ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Değerlendirme Sayısı</Text>
          <Text style={styles.summaryValue}>{stats.ratingCount}</Text>
        </View>
      ) : null}
    </Card>
  );
}
