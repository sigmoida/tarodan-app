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
  },
  content: {
    flex: 1,
    padding: 16,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  overviewContent: {
    alignItems: 'center',
    padding: 8,
  },
  overviewValue: {
    marginTop: 8,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  overviewLabel: {
    color: colors.text.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  chartCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  chartHeader: {
    marginBottom: 16,
  },
  simpleChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: 8,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 4,
  },
  bar: {
    width: 24,
    backgroundColor: colors.primary[600]!,
    borderRadius: radius.sm,
    minHeight: 4,
  },
  barLabel: {
    marginTop: 8,
    fontSize: 11,
    color: colors.text.muted,
  },
  chartFooter: {
    marginTop: 16,
    alignItems: 'center',
  },
  chartTotal: {
    color: colors.text.muted,
  },
  card: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text.heading,
  },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
    marginTop: 4,
  },
  listingStat: {
    marginLeft: 4,
    fontSize: 12,
    color: colors.text.muted,
  },
  premiumCard: {
    marginBottom: 12,
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  premiumTitle: {
    marginLeft: 8,
    color: colors.primary[600]!,
  },
  premiumText: {
    color: colors.text.muted,
    marginBottom: 8,
  },
  premiumFeatures: {
    marginBottom: 16,
  },
  premiumFeature: {
    color: colors.text.heading,
    marginVertical: 2,
  },
  premiumButton: {
    backgroundColor: colors.primary[600]!,
  },
  // Premium Analytics Styles
  premiumSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumSectionTitle: {
    marginLeft: 8,
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
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: radius.lg,
    marginHorizontal: 4,
  },
  metricValue: {
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  metricLabel: {
    color: colors.text.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    marginBottom: 4,
  },
  revenueBarFill: {
    width: 32,
    backgroundColor: colors.primary[600]!,
    borderRadius: radius.sm,
    minHeight: 4,
  },
  revenueBarLabel: {
    marginTop: 8,
    fontSize: 11,
    color: colors.text.muted,
  },
  tradeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
  },
  tradeStat: {
    alignItems: 'center',
  },
  tradeStatValue: {
    marginTop: 8,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  tradeStatLabel: {
    color: colors.text.muted,
    marginTop: 4,
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
    paddingVertical: 16,
  },
  collectionStat: {
    alignItems: 'center',
  },
  collectionStatValue: {
    marginTop: 8,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  collectionStatLabel: {
    color: colors.text.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  performerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  conversionBadge: {
    backgroundColor: colors.success[50]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  conversionText: {
    color: colors.success[700]!,
    fontWeight: '600',
    fontSize: 12,
  },
});
