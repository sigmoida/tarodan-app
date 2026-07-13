import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// Analitik ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
    backgroundColor: colors.surface.DEFAULT,
  },
  title: {
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing[6],
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
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  overviewRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  overviewCard: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  overviewContent: {
    alignItems: 'center',
    padding: theme.spacing[2],
  },
  overviewValue: {
    marginTop: theme.spacing[2],
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  overviewLabel: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
    textAlign: 'center',
  },
  chartCard: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  chartHeader: {
    marginBottom: theme.spacing[4],
  },
  simpleChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: theme.spacing[2],
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: theme.spacing[1],
  },
  bar: {
    width: 24,
    backgroundColor: colors.primary[600]!,
    borderRadius: radius.sm,
    minHeight: 4,
  },
  barLabel: {
    marginTop: theme.spacing[2],
    fontSize: 11,
    color: colors.text.muted,
  },
  chartFooter: {
    marginTop: theme.spacing[4],
    alignItems: 'center',
  },
  chartTotal: {
    color: colors.text.muted,
  },
  card: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: theme.spacing[3],
    color: colors.text.heading,
  },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  listingRank: {
    width: 30,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  listingInfo: {
    flex: 1,
  },
  listingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[1],
  },
  listingStat: {
    marginLeft: theme.spacing[1],
    fontSize: 12,
    color: colors.text.muted,
  },
  premiumCard: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  premiumTitle: {
    marginLeft: theme.spacing[2],
    color: colors.primary[600]!,
  },
  premiumText: {
    color: colors.text.muted,
    marginBottom: theme.spacing[2],
  },
  premiumFeatures: {
    marginBottom: theme.spacing[4],
  },
  premiumFeature: {
    color: colors.text.heading,
    marginVertical: theme.spacing[0.5],
  },
  premiumButton: {
    backgroundColor: colors.primary[600]!,
  },
  // Premium Analytics Styles
  premiumSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  premiumSectionTitle: {
    marginLeft: theme.spacing[2],
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing[3],
    backgroundColor: colors.surface.alt,
    borderRadius: radius.lg,
    marginHorizontal: theme.spacing[1],
  },
  metricValue: {
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  metricLabel: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
    textAlign: 'center',
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  revenueLabel: {
    color: colors.text.muted,
  },
  revenueTotal: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  revenueChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
  },
  revenueBar: {
    alignItems: 'center',
    flex: 1,
  },
  revenueBarValue: {
    fontSize: 10,
    color: colors.text.muted,
    marginBottom: theme.spacing[1],
  },
  revenueBarFill: {
    width: 32,
    backgroundColor: colors.primary[600]!,
    borderRadius: radius.sm,
    minHeight: 4,
  },
  revenueBarLabel: {
    marginTop: theme.spacing[2],
    fontSize: 11,
    color: colors.text.muted,
  },
  tradeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing[4],
  },
  tradeStat: {
    alignItems: 'center',
  },
  tradeStatValue: {
    marginTop: theme.spacing[2],
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  tradeStatLabel: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  successRateCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.success[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successRateText: {
    color: colors.success[600]!,
    fontWeight: 'bold',
  },
  collectionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing[4],
  },
  collectionStat: {
    alignItems: 'center',
  },
  collectionStatValue: {
    marginTop: theme.spacing[2],
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  collectionStatLabel: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
    textAlign: 'center',
  },
  performerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  conversionBadge: {
    backgroundColor: colors.success[50]!,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: radius.lg,
  },
  conversionText: {
    color: colors.success[700]!,
    fontWeight: '600',
    fontSize: 12,
  },
});
