import { StyleSheet, Platform } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// ---------------------------------------------------------------------------
// ListingForm — shared route-local stylesheet (moved verbatim from the
// monolith; a single cohesive sheet imported by every section/modal).
// ---------------------------------------------------------------------------
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  authText: {
    fontSize: 16,
    color: colors.text.muted,
    marginBottom: theme.spacing[4],
    textAlign: 'center',
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: theme.spacing[4],
    paddingHorizontal: theme.spacing[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.heading,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[4],
  },

  // Limits
  ibanBanner: {
    margin: theme.spacing[4],
    marginBottom: theme.spacing[0],
    padding: theme.spacing[4],
    backgroundColor: colors.warning[50]!,
    borderRadius: theme.radius['2xl'],
    borderWidth: 1,
    borderColor: colors.warning[300]!,
  },
  ibanBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning[800]!,
    marginBottom: theme.spacing[1],
  },
  ibanBannerBody: {
    fontSize: 13,
    color: colors.warning[700]!,
    marginBottom: theme.spacing[2.5],
    lineHeight: 18,
  },
  ibanBannerButton: {
    backgroundColor: colors.warning[600]!,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    alignSelf: 'flex-start',
  },
  ibanBannerButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  limitsPlaceholder: {
    backgroundColor: colors.gray[200],
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    alignItems: 'center',
  },
  limitsCard: {
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
  },
  limitsOk: {
    backgroundColor: colors.success[50]!,
    borderColor: colors.success[200]!,
  },
  limitsExceeded: {
    backgroundColor: colors.danger[50]!,
    borderColor: colors.danger[200]!,
  },
  limitsPremium: {
    backgroundColor: colors.warning[50]!,
    borderColor: colors.warning[200]!,
  },
  limitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  limitsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  limitsTitleOk: { color: colors.success[800]! },
  limitsTitleExceeded: { color: colors.danger[800]! },
  limitsTitlePremium: { color: colors.warning[800]! },
  limitsRemaining: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: theme.spacing[0.5],
  },
  upgradeButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.xl,
  },
  upgradeButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.gray[200],
    borderRadius: 3,
    marginTop: theme.spacing[2.5],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressFillOk: { backgroundColor: colors.warning[500]! },
  progressFillExceeded: { backgroundColor: colors.danger[600]! },

  // Reactivation
  reactivateCard: {
    backgroundColor: colors.warning[50]!,
    borderColor: colors.warning[200]!,
  },
  reactivateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.warning[800]!,
    marginBottom: theme.spacing[1],
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 1,
    marginBottom: theme.spacing[3.5],
  },

  // Labels
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: theme.spacing[1.5],
  },
  required: {
    color: colors.danger[600]!,
  },
  charCount: {
    fontSize: 11,
    color: colors.text.subtle,
    textAlign: 'right',
    marginTop: theme.spacing[0.5],
  },
  hint: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: theme.spacing[1],
  },
  reservedHint: {
    fontSize: 12,
    color: colors.warning[700]!,
    marginTop: theme.spacing[1],
  },

  // Inputs
  input: {
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: theme.radius['2xl'],
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[3],
    fontSize: 15,
    color: colors.text.heading,
    backgroundColor: colors.white,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Picker button
  pickerButton: {
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: theme.radius['2xl'],
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  pickerDisabled: {
    backgroundColor: colors.surface.alt,
    opacity: 0.6,
  },
  pickerValue: {
    fontSize: 15,
    color: colors.text.heading,
    flex: 1,
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: colors.text.subtle,
    flex: 1,
  },
  pickerArrow: {
    fontSize: 20,
    color: colors.text.subtle,
    marginLeft: theme.spacing[2],
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    marginTop: theme.spacing[0.5],
  },
  chip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    marginRight: theme.spacing[2],
    backgroundColor: colors.white,
  },
  chipActive: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  chipText: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.white,
  },

  // Images
  imageUploadArea: {
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  imageUploadIcon: {
    fontSize: 28,
    marginBottom: theme.spacing[1.5],
  },
  imageUploadLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.muted,
  },
  imageUploadCount: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: theme.spacing[1],
  },
  imageMaxReached: {
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.radius['2xl'],
    borderWidth: 1,
    borderColor: colors.success[200]!,
    backgroundColor: colors.success[50]!,
    alignItems: 'center',
  },
  imageMaxReachedText: {
    fontSize: 13,
    color: colors.success[800]!,
  },
  imageRow: {
    marginTop: theme.spacing[3],
  },
  imageThumbWrap: {
    width: 88,
    height: 88,
    marginRight: theme.spacing[2.5],
    borderRadius: theme.radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  imageThumb: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.radius.md,
  },
  coverBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.danger[600]!,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[3.5],
    borderRadius: theme.radius['2xl'],
    borderWidth: 1,
  },
  toggleRowEnabled: {
    backgroundColor: colors.success[50]!,
    borderColor: colors.success[200]!,
  },
  toggleRowDisabled: {
    backgroundColor: colors.surface.alt,
    borderColor: colors.border.DEFAULT,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  toggleHint: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  upgradeLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
  },

  // Discount
  discountBox: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  discountPercent: {
    marginTop: theme.spacing[1.5],
    fontSize: 13,
    fontWeight: '600',
    color: colors.success[700]!,
  },

  // Commission
  commissionCard: {
    marginTop: theme.spacing[4],
    padding: theme.spacing[3],
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  commissionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  commissionRow: {
    marginTop: theme.spacing[1.5],
  },
  commissionFee: {
    fontSize: 13,
    color: colors.text.muted,
  },
  commissionNet: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success[800]!,
    marginTop: theme.spacing[0.5],
  },

  // Submit
  submitRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.muted,
  },
  submitButton: {
    flex: 1,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.radius['2xl'],
    backgroundColor: colors.primary[600]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.radius['2xl'],
    borderWidth: 1,
    borderColor: colors.danger[200]!,
    backgroundColor: colors.danger[50]!,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger[600]!,
  },
  primaryButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 28,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.radius['2xl'],
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.black50,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.heading,
  },
  modalClose: {
    fontSize: 20,
    color: colors.text.subtle,
    fontWeight: '600',
  },
  modalSearch: {
    marginHorizontal: theme.spacing[5],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: theme.radius['2xl'],
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    fontSize: 15,
    color: colors.text.heading,
    backgroundColor: colors.surface.alt,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  modalItemSelected: {
    backgroundColor: colors.primary[50]!,
  },
  modalItemText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  modalItemTextSelected: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  checkMark: {
    fontSize: 16,
    color: colors.primary[600]!,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.text.subtle,
    fontSize: 14,
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[8],
  },
});
