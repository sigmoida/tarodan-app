import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// İşletme paneli ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: colors.danger[600]!,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  companyHeader: {
    padding: 16,
    margin: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  companyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  companyAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  companyAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[100]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  companyAvatarText: {
    fontSize: 32,
  },
  companyDetails: {
    marginLeft: 16,
    flex: 1,
  },
  companyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  companyTitle: {
    fontSize: 14,
    color: colors.primary[600]!,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary[600]!,
  },
  tabText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  tabContent: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  revenueCard: {
    marginBottom: 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  revenueGradient: {
    padding: 20,
  },
  revenueLabel: {
    fontSize: 14,
    color: colors.success[700]!,
    fontWeight: '600',
  },
  revenueValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
  },
  weeklyCard: {
    marginBottom: 16,
    borderRadius: radius.lg,
  },
  collectionStatsCard: {
    borderRadius: radius.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
  },
  weeklyStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  weeklyStat: {
    alignItems: 'center',
  },
  weeklyStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 8,
  },
  weeklyStatLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 8,
  },
  productRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface.alt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  productImage: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    marginRight: 12,
  },
  productImagePlaceholder: {
    backgroundColor: colors.surface.alt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  productPrice: {
    fontSize: 12,
    color: colors.primary[600]!,
    marginTop: 2,
  },
  productStats: {
    alignItems: 'flex-end',
  },
  productStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productStatText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingVertical: 24,
  },
});
