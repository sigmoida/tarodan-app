import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  planCard: {
    marginBottom: 24,
    borderWidth: 2,
    backgroundColor: colors.surface.DEFAULT,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: 'normal',
    color: colors.text.muted,
  },
  popularBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  featuresCompact: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.text.heading,
  },
  moreFeatures: {
    marginLeft: 24,
    fontSize: 13,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
  },
  paymentCard: {
    marginBottom: 24,
    backgroundColor: colors.surface.DEFAULT,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  paymentOptionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.muted,
  },
  summaryCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.text.muted,
  },
  summaryValue: {
    fontSize: 14,
    color: colors.text.heading,
  },
  vatNote: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  terms: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary[600]!,
    textDecorationLine: 'underline',
  },
  payButton: {
    borderRadius: 12,
  },
});
