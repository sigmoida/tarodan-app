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
    gap: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    padding: 12,
    borderRadius: 10,
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
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    gap: 10,
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
    marginTop: 2,
  },

  // Current Plan Card
  currentPlanCard: {
    backgroundColor: colors.surface.elevated,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
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
    marginBottom: 12,
  },
  currentPlanLabel: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 4,
  },
  currentPlanName: {
    fontSize: 22,
    fontWeight: '700',
  },
  currentPlanExpiry: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: 6,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    padding: 4,
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
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success[800]!,
  },

  // Tier Cards
  tierCardsContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 12,
  },
  tierCard: {
    width: 280,
    backgroundColor: colors.surface.elevated,
    borderRadius: 16,
    padding: 20,
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
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    marginTop: 12,
    marginBottom: 10,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
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
    marginLeft: 2,
  },
  tierMonthlyEquiv: {
    fontSize: 12,
    color: colors.text.subtle,
    marginBottom: 2,
  },
  tierDivider: {
    height: 1,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: 14,
  },
  tierFeatures: {
    gap: 10,
  },
  tierFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierFeatureText: {
    fontSize: 13,
    color: colors.text.heading,
    flex: 1,
  },
  tierButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  tierButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
