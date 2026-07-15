// Checkout ekranının stilleri — orijinal index.tsx'ten birebir taşındı.
import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing[5],
    backgroundColor: colors.surface.DEFAULT,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCircle: {
    width: 32,
    height: 32,
    borderRadius: theme.radius['3xl'],
    backgroundColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleActive: {
    backgroundColor: colors.primary[600]!,
  },
  progressNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.muted,
  },
  progressNumberActive: {
    color: colors.white,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: theme.spacing[2],
  },
  progressLabelActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  progressLine: {
    width: 30,
    height: 2,
    backgroundColor: colors.border.DEFAULT,
    marginHorizontal: theme.spacing[2],
  },
  progressLineActive: {
    backgroundColor: colors.primary[600]!,
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  section: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginLeft: theme.spacing[3],
  },
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: colors.warning[50]!,
    padding: theme.spacing[3],
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing[4],
  },
  guestNoticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning[600]!,
    marginLeft: theme.spacing[2],
  },
  input: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  helperText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  loginLink: {
    marginTop: theme.spacing[2],
  },
  loginLinkText: {
    color: colors.primary[600]!,
    fontSize: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[3],
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    marginBottom: theme.spacing[2.5],
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  optionContent: {
    flex: 1,
    marginLeft: theme.spacing[1],
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  optionPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  savedAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
    borderWidth: 2,
    borderColor: 'transparent',
  },
  savedAddressRowActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  addressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
  addressLine: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  defaultBadge: {
    fontSize: 11,
    color: colors.success[600]!,
    fontWeight: '600',
  },
  paytrNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius['2xl'],
    backgroundColor: colors.success[50]!,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.success[600]!,
    marginTop: theme.spacing[1],
  },
  paytrNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.success[800] ?? colors.success[600]!,
  },
  providerChip: {
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  providerChipActive: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  providerChipText: {
    fontSize: 13,
    color: colors.text.heading,
    fontWeight: '600',
  },
  providerChipTextActive: {
    color: colors.white,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  orderItemImage: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.surface.alt,
  },
  orderItemInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  orderItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
  },
  orderItemMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  orderItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: colors.success[50]!,
    padding: theme.spacing[4],
    borderRadius: 12,
  },
  securityContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.success[600]!,
  },
  securityText: {
    fontSize: 13,
    color: colors.success[600]!,
    marginTop: theme.spacing[1],
  },
  orderSummary: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[4],
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[4],
  },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[2],
  },
  orderSummaryLabel: {
    fontSize: 14,
    color: colors.text.muted,
  },
  orderSummaryValue: {
    fontSize: 14,
    color: colors.text.heading,
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  orderTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  bottomBar: {
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  actionButton: {
    borderRadius: 12,
  },
  continueButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: theme.spacing[8],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.alt,
    padding: theme.spacing[5],
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
});
