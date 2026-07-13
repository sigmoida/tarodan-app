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
    padding: theme.spacing[8],
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: theme.spacing[4],
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  planCard: {
    marginBottom: theme.spacing[4],
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
    marginTop: theme.spacing[2],
    alignSelf: 'flex-start',
  },
  divider: {
    marginVertical: theme.spacing[4],
  },
  planDetails: {
    gap: theme.spacing[2],
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
    marginBottom: theme.spacing[4],
    textAlign: 'center',
  },
  upgradeButton: {
    alignSelf: 'stretch',
  },
  card: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: theme.spacing[4],
    color: colors.text.heading,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featureItem: {
    width: '33%',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing[1],
  },
  featureText: {
    textAlign: 'center',
    color: colors.text.heading,
  },
  billingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  billingInfo: {
    flex: 1,
  },
  billingDate: {
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  billingAmount: {
    alignItems: 'flex-end',
    marginRight: theme.spacing[2],
  },
  amount: {
    color: colors.text.heading,
    fontWeight: 'bold',
  },
  paymentStatusChip: {
    marginTop: theme.spacing[1],
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
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
    marginTop: theme.spacing[0.5],
  },
  warningCard: {
    marginBottom: theme.spacing[4],
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
    marginLeft: theme.spacing[3],
  },
  warningDesc: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
  },
  helpText: {
    marginLeft: theme.spacing[2],
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
