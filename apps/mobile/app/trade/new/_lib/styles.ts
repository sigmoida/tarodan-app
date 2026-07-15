import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Takas oluşturma sihirbazının route-local stylesheet'i (monolitten birebir taşındı).
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
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[5],
    backgroundColor: colors.surface.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  stepWrapper: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: theme.radius['3xl'],
    backgroundColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary[600]!,
  },
  stepNumber: {
    fontWeight: 'bold',
    color: colors.text.muted,
  },
  stepNumberActive: {
    color: colors.white,
  },
  stepLabel: {
    marginTop: theme.spacing[1],
    fontSize: 12,
    color: colors.text.muted,
  },
  stepLabelActive: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  sectionTitle: {
    marginBottom: theme.spacing[4],
    color: colors.text.heading,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
    borderWidth: 2,
    borderColor: 'transparent',
  },
  productCardSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.border.DEFAULT,
  },
  productInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  productTitle: {
    color: colors.text.heading,
  },
  productPrice: {
    color: colors.primary[600]!,
    fontWeight: '600',
    marginTop: theme.spacing[1],
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  emptyCard: {
    marginTop: theme.spacing[8],
    backgroundColor: colors.surface.DEFAULT,
  },
  emptyContent: {
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  emptyText: {
    color: colors.text.muted,
    marginVertical: theme.spacing[4],
    textAlign: 'center',
  },
  cashCard: {
    marginTop: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  cashTitle: {
    marginBottom: theme.spacing[3],
  },
  cashDirectionRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
  cashChip: {
    flex: 1,
  },
  cashInput: {
    backgroundColor: colors.surface.DEFAULT,
  },
  stepActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing[6],
  },
  summaryCard: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryTitle: {
    marginBottom: theme.spacing[3],
    color: colors.text.heading,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
  },
  summaryImage: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: colors.border.DEFAULT,
  },
  summaryItemTitle: {
    flex: 1,
    marginLeft: theme.spacing[3],
    color: colors.text.heading,
  },
  summaryItemPrice: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  summaryDivider: {
    marginVertical: theme.spacing[3],
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPrice: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  messageInput: {
    marginBottom: theme.spacing[1],
    backgroundColor: colors.surface.DEFAULT,
  },
  charCount: {
    textAlign: 'right',
    marginBottom: theme.spacing[4],
  },
  protectionCard: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[200]!,
  },
  protectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protectionText: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  protectionDesc: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  premiumRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
    backgroundColor: colors.surface.DEFAULT,
  },
  premiumTitle: {
    marginTop: theme.spacing[6],
    textAlign: 'center',
    color: colors.text.heading,
  },
  premiumSubtitle: {
    marginTop: theme.spacing[2],
    textAlign: 'center',
    color: colors.text.muted,
  },
  premiumFeatures: {
    marginTop: theme.spacing[6],
    alignSelf: 'flex-start',
    width: '100%',
  },
  premiumFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing[2],
  },
  premiumFeatureText: {
    marginLeft: theme.spacing[3],
    color: colors.text.heading,
  },
  upgradeButton: {
    marginTop: theme.spacing[6],
    width: '100%',
  },
});
