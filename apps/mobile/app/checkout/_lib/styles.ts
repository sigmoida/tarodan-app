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
    paddingVertical: 20,
    backgroundColor: colors.surface.DEFAULT,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    marginLeft: 8,
  },
  progressLabelActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  progressLine: {
    width: 30,
    height: 2,
    backgroundColor: colors.border.DEFAULT,
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: colors.primary[600]!,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginLeft: 12,
  },
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  guestNoticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning[600]!,
    marginLeft: 8,
  },
  input: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  helperText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  loginLink: {
    marginTop: 8,
  },
  loginLinkText: {
    color: colors.primary[600]!,
    fontSize: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  optionContent: {
    flex: 1,
    marginLeft: 4,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  optionPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  savedAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
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
    marginTop: 2,
  },
  defaultBadge: {
    fontSize: 11,
    color: colors.success[600]!,
    fontWeight: '600',
  },
  paytrNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.success[50]!,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.success[600]!,
    marginTop: 4,
  },
  paytrNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.success[800] ?? colors.success[600]!,
  },
  providerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    marginBottom: 12,
  },
  orderItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  orderItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  orderItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
  },
  orderItemMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: colors.success[50]!,
    padding: 16,
    borderRadius: 12,
  },
  securityContent: {
    flex: 1,
    marginLeft: 12,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.success[600]!,
  },
  securityText: {
    fontSize: 13,
    color: colors.success[600]!,
    marginTop: 4,
  },
  orderSummary: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
  },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  actionButton: {
    borderRadius: 12,
  },
  continueButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.alt,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 8,
  },
});
