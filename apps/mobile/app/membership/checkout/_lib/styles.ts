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
    padding: theme.spacing[4],
  },
  planCard: {
    marginBottom: theme.spacing[6],
    borderWidth: 2,
    backgroundColor: colors.surface.DEFAULT,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing[4],
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[1],
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: 'normal',
    color: colors.text.muted,
  },
  popularBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: 12,
  },
  popularBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  featuresCompact: {
    gap: theme.spacing[2],
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    marginLeft: theme.spacing[2],
    fontSize: 14,
    color: colors.text.heading,
  },
  moreFeatures: {
    marginLeft: theme.spacing[6],
    fontSize: 13,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[3],
  },
  paymentCard: {
    marginBottom: theme.spacing[6],
    backgroundColor: colors.surface.DEFAULT,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
  },
  paymentOptionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.muted,
  },
  summaryCard: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[2],
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
    marginTop: theme.spacing[0.5],
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: theme.spacing[3],
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
    marginBottom: theme.spacing[4],
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
