import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Üyelik ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    margin: theme.spacing[4],
    padding: theme.spacing[3],
    borderRadius: theme.radius['2xl'],
    backgroundColor: colors.danger[50]!,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger[600]!,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger[600]!,
  },
  errorBannerRetry: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger[600]!,
  },
  loadingText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  scrollView: {
    flex: 1,
  },

  // Pending Payment Banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[100]!,
    borderColor: colors.warning[500]!,
    borderWidth: 1,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: 12,
    padding: theme.spacing[3.5],
    gap: theme.spacing[2.5],
  },
  pendingBannerText: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning[800]!,
  },
  pendingSubtitle: {
    fontSize: 12,
    color: colors.warning[700]!,
    marginTop: theme.spacing[0.5],
  },

  // Current Plan Card
  currentPlanCard: {
    backgroundColor: colors.surface.elevated,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.radius['3xl'],
    padding: theme.spacing[5],
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  currentPlanIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  currentPlanLabel: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: theme.spacing[1],
  },
  currentPlanName: {
    fontSize: 22,
    fontWeight: '700',
  },
  currentPlanExpiry: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: theme.spacing[1.5],
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.xl,
    backgroundColor: colors.primary[50]!,
  },
  manageButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
  },

  // Toggle
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface.elevated,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[5],
    borderRadius: 12,
    padding: theme.spacing[1],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.radius['2xl'],
    gap: theme.spacing[1.5],
  },
  toggleButtonActive: {
    backgroundColor: colors.primary[600]!,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
  },
  toggleTextActive: {
    color: colors.white,
  },
  discountBadge: {
    backgroundColor: colors.success[100]!,
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.radius.lg,
  },
  discountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success[800]!,
  },

  // Tier Cards
  tierCardsContainer: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[5],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[3],
  },
  tierCard: {
    width: 280,
    backgroundColor: colors.surface.elevated,
    borderRadius: theme.radius['3xl'],
    padding: theme.spacing[5],
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 420,
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 12,
  },
  popularBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  currentBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderTopLeftRadius: 14,
    borderBottomRightRadius: 12,
  },
  currentBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  tierIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2.5],
  },
  tierName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.spacing[1],
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing[0.5],
  },
  tierPriceFree: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.heading,
  },
  tierPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.heading,
  },
  tierPricePeriod: {
    fontSize: 14,
    color: colors.text.muted,
    marginLeft: theme.spacing[0.5],
  },
  tierMonthlyEquiv: {
    fontSize: 12,
    color: colors.text.subtle,
    marginBottom: theme.spacing[0.5],
  },
  tierDivider: {
    height: 1,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: theme.spacing[3.5],
  },
  tierFeatures: {
    gap: theme.spacing[2.5],
  },
  tierFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  tierFeatureText: {
    fontSize: 13,
    color: colors.text.heading,
    flex: 1,
  },
  tierButton: {
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius['2xl'],
    alignItems: 'center',
  },
  tierButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
