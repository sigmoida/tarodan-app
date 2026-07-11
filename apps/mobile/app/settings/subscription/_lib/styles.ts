import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Abonelik ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  planCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 2,
    borderColor: colors.primary[200]!,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planName: {
    color: colors.text.heading,
    fontWeight: 'bold',
  },
  statusChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  divider: {
    marginVertical: 16,
  },
  planDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: colors.text.muted,
  },
  detailValue: {
    fontWeight: '500',
  },
  upgradePrompt: {
    color: colors.text.muted,
    marginBottom: 16,
    textAlign: 'center',
  },
  upgradeButton: {
    alignSelf: 'stretch',
  },
  card: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featureItem: {
    width: '33%',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureText: {
    textAlign: 'center',
    color: colors.text.heading,
  },
  billingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  billingInfo: {
    flex: 1,
  },
  billingDate: {
    color: colors.text.muted,
    marginTop: 2,
  },
  billingAmount: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  amount: {
    color: colors.text.heading,
    fontWeight: 'bold',
  },
  paymentStatusChip: {
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontWeight: '500',
    color: colors.text.heading,
  },
  actionDesc: {
    color: colors.text.muted,
    marginTop: 2,
  },
  warningCard: {
    marginBottom: 16,
    backgroundColor: colors.warning[50]!,
    borderWidth: 1,
    borderColor: colors.warning[200]!,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    fontWeight: '600',
    color: colors.text.heading,
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
  },
  warningDesc: {
    color: colors.text.muted,
    marginTop: 4,
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  helpText: {
    marginLeft: 8,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
