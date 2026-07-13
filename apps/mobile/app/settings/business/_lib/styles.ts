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
    marginTop: theme.spacing[3],
    color: colors.text.muted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  errorText: {
    fontSize: 16,
    color: colors.danger[600]!,
    textAlign: 'center',
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  content: {
    flex: 1,
  },
  companyHeader: {
    padding: theme.spacing[4],
    margin: theme.spacing[4],
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
    marginLeft: theme.spacing[4],
    flex: 1,
  },
  companyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  companyName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  companyTitle: {
    fontSize: 14,
    color: colors.primary[600]!,
    marginTop: theme.spacing[1],
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[1.5],
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
    padding: theme.spacing[4],
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: theme.spacing[4],
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[2],
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  revenueCard: {
    marginBottom: theme.spacing[4],
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  revenueGradient: {
    padding: theme.spacing[5],
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
    marginTop: theme.spacing[1],
  },
  weeklyCard: {
    marginBottom: theme.spacing[4],
    borderRadius: radius.lg,
  },
  collectionStatsCard: {
    borderRadius: radius.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[3],
  },
  weeklyStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing[2],
  },
  weeklyStat: {
    alignItems: 'center',
  },
  weeklyStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[2],
  },
  weeklyStatLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  productRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface.alt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing[3],
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
    marginRight: theme.spacing[3],
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
    marginTop: theme.spacing[0.5],
  },
  productStats: {
    alignItems: 'flex-end',
  },
  productStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  productStatText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingVertical: theme.spacing[6],
  },
});
