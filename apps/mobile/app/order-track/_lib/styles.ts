import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Sipariş takip ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  formCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginLeft: 12,
  },
  formDescription: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  input: {
    marginBottom: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger[50]!,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.danger[600]!,
    marginLeft: 8,
  },
  trackButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  resultCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  resultHeaderInfo: {
    flex: 1,
    marginRight: 12,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  orderDate: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
    marginLeft: 6,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: 8,
  },
  productSection: {
    marginBottom: 16,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.heading,
  },
  priceSection: {
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priceLabel: {
    fontSize: 14,
    color: colors.text.muted,
  },
  priceValue: {
    fontSize: 14,
    color: colors.text.heading,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  shippingSection: {
    marginBottom: 16,
  },
  shippingInfo: {
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
    padding: 12,
  },
  shippingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  shippingLabel: {
    fontSize: 14,
    color: colors.text.muted,
    marginRight: 12,
  },
  shippingValue: {
    flex: 1,
    fontSize: 14,
    color: colors.text.heading,
    fontWeight: '500',
    textAlign: 'right',
  },
  trackingNumber: {
    color: colors.primary[600]!,
    fontFamily: 'monospace',
  },
  timelineSection: {
    marginTop: 8,
  },
  timeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  timelineItem: {
    alignItems: 'center',
    flex: 1,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCurrent: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary[50]!,
  },
  timelineLine: {
    position: 'absolute',
    top: 11,
    left: '50%',
    right: '-50%',
    marginLeft: 14,
    marginRight: 14,
    height: 2,
    backgroundColor: colors.border.DEFAULT,
  },
  timelineLabel: {
    fontSize: 10,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  timelineLabelActive: {
    color: colors.text.heading,
  },
  timelineLabelCurrent: {
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  closedState: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  closedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 10,
  },
  closedHint: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
  helpSection: {
    flexDirection: 'row',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
  },
  helpContent: {
    flex: 1,
    marginLeft: 12,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  helpText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[600]!,
    marginRight: 4,
  },
});
