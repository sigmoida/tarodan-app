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
    padding: theme.spacing[4],
  },
  formCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginLeft: theme.spacing[3],
  },
  formDescription: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: theme.spacing[5],
    lineHeight: 20,
  },
  input: {
    marginBottom: theme.spacing[3],
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger[50]!,
    padding: theme.spacing[3],
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing[4],
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.danger[600]!,
    marginLeft: theme.spacing[2],
  },
  trackButton: {
    borderRadius: 12,
    marginTop: theme.spacing[2],
  },
  resultCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  resultHeaderInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  orderDate: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: 20,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
    marginLeft: theme.spacing[1.5],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: theme.spacing[2],
  },
  productSection: {
    marginBottom: theme.spacing[4],
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.heading,
  },
  priceSection: {
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[1],
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
    marginBottom: theme.spacing[4],
  },
  shippingInfo: {
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[3],
  },
  shippingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing[2],
  },
  shippingLabel: {
    fontSize: 14,
    color: colors.text.muted,
    marginRight: theme.spacing[3],
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
    marginTop: theme.spacing[2],
  },
  timeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing[4],
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
    marginLeft: theme.spacing[3.5],
    marginRight: theme.spacing[3.5],
    height: 2,
    backgroundColor: colors.border.DEFAULT,
  },
  timelineLabel: {
    fontSize: 10,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: theme.spacing[2],
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
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[2],
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
    marginTop: theme.spacing[2.5],
  },
  closedHint: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: theme.spacing[1.5],
    lineHeight: 17,
  },
  helpSection: {
    flexDirection: 'row',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[4],
  },
  helpContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  helpText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
    lineHeight: 18,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[3],
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[600]!,
    marginRight: theme.spacing[1],
  },
});
