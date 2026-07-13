import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local paylaşılan stylesheet (§12 home deseni) — sales ekranının tüm
// section/card/modal bileşenleri buradan okur. Monolitten BİREBİR taşındı.
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
    backgroundColor: colors.surface.DEFAULT,
  },
  title: {
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  earningsCard: {
    margin: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  earningsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningLabel: {
    color: colors.text.muted,
    marginBottom: theme.spacing[1],
  },
  earningValue: {
    color: colors.success[600]!,
    fontWeight: 'bold',
  },
  earningValuePending: {
    color: colors.warning[600]!,
    fontWeight: 'bold',
  },
  earningDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border.DEFAULT,
  },
  filterContainer: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterChip: {
    marginRight: theme.spacing[2],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  emptyTitle: {
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  salesList: {
    flex: 1,
    padding: theme.spacing[4],
  },
  saleCard: {
    marginBottom: theme.spacing[3],
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  orderNumber: {
    color: colors.text.muted,
  },
  saleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.surface.alt,
  },
  saleInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  buyerName: {
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  addressText: {
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  priceSection: {
    alignItems: 'flex-end',
  },
  price: {
    color: colors.primary[700]!,
    fontWeight: 'bold',
  },
  dateText: {
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  actionButtons: {
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
});
