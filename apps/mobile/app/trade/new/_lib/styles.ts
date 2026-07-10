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
    padding: 32,
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
    color: colors.text.muted,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 20,
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
    borderRadius: 16,
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
    marginTop: 4,
    fontSize: 12,
    color: colors.text.muted,
  },
  stepLabelActive: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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
    borderRadius: 8,
    backgroundColor: colors.border.DEFAULT,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productTitle: {
    color: colors.text.heading,
  },
  productPrice: {
    color: colors.primary[600]!,
    fontWeight: '600',
    marginTop: 4,
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
    marginTop: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: colors.text.muted,
    marginVertical: 16,
    textAlign: 'center',
  },
  cashCard: {
    marginTop: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  cashTitle: {
    marginBottom: 12,
  },
  cashDirectionRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
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
    marginTop: 24,
  },
  summaryCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryTitle: {
    marginBottom: 12,
    color: colors.text.heading,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.border.DEFAULT,
  },
  summaryItemTitle: {
    flex: 1,
    marginLeft: 12,
    color: colors.text.heading,
  },
  summaryItemPrice: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  summaryDivider: {
    marginVertical: 12,
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
    marginBottom: 4,
    backgroundColor: colors.surface.DEFAULT,
  },
  charCount: {
    textAlign: 'right',
    marginBottom: 16,
  },
  protectionCard: {
    marginBottom: 16,
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
    marginLeft: 12,
  },
  protectionDesc: {
    color: colors.text.muted,
    marginTop: 4,
  },
  premiumRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  premiumTitle: {
    marginTop: 24,
    textAlign: 'center',
    color: colors.text.heading,
  },
  premiumSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.text.muted,
  },
  premiumFeatures: {
    marginTop: 24,
    alignSelf: 'flex-start',
    width: '100%',
  },
  premiumFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  premiumFeatureText: {
    marginLeft: 12,
    color: colors.text.heading,
  },
  upgradeButton: {
    marginTop: 24,
    width: '100%',
  },
});
