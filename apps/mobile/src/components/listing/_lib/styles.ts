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
    padding: 24,
  },
  authText: {
    fontSize: 16,
    color: colors.text.muted,
    marginBottom: 16,
    textAlign: 'center',
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
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
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.heading,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 4,
    marginBottom: 16,
  },

  // Limits
  ibanBanner: {
    margin: 16,
    marginBottom: 0,
    padding: 16,
    backgroundColor: colors.warning[50]!,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.warning[300]!,
  },
  ibanBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning[800]!,
    marginBottom: 4,
  },
  ibanBannerBody: {
    fontSize: 13,
    color: colors.warning[700]!,
    marginBottom: 10,
    lineHeight: 18,
  },
  ibanBannerButton: {
    backgroundColor: colors.warning[600]!,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  ibanBannerButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  limitsPlaceholder: {
    backgroundColor: colors.gray[200],
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  limitsCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
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
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
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
    marginTop: 10,
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
    marginBottom: 4,
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
    marginBottom: 14,
  },

  // Labels
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: 6,
  },
  required: {
    color: colors.danger[600]!,
  },
  charCount: {
    fontSize: 11,
    color: colors.text.subtle,
    textAlign: 'right',
    marginTop: 2,
  },
  hint: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: 4,
  },
  reservedHint: {
    fontSize: 12,
    color: colors.warning[700]!,
    marginTop: 4,
  },

  // Inputs
  input: {
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    borderRadius: 10,
    paddingHorizontal: 14,
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
    marginLeft: 8,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    marginRight: 8,
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
    marginBottom: 6,
  },
  imageUploadLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.muted,
  },
  imageUploadCount: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: 4,
  },
  imageMaxReached: {
    paddingVertical: 14,
    borderRadius: 10,
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
    marginTop: 12,
  },
  imageThumbWrap: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: 10,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
    padding: 14,
    borderRadius: 10,
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
    marginTop: 2,
  },
  upgradeLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
  },

  // Discount
  discountBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  discountPercent: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.success[700]!,
  },

  // Commission
  commissionCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  commissionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  commissionRow: {
    marginTop: 6,
  },
  commissionFee: {
    fontSize: 13,
    color: colors.text.muted,
  },
  commissionNet: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success[800]!,
    marginTop: 2,
  },

  // Submit
  submitRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
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
    paddingVertical: 14,
    borderRadius: 10,
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
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
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
    paddingVertical: 14,
    borderRadius: 10,
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
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text.heading,
    backgroundColor: colors.surface.alt,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
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
    marginTop: 32,
    marginBottom: 32,
  },
});
