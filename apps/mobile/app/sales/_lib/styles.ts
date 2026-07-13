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
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
  },
  earningsCard: {
    margin: 16,
    marginBottom: 8,
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
    marginBottom: 4,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterChip: {
    marginRight: 8,
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
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
  },
  salesList: {
    flex: 1,
    padding: 16,
  },
  saleCard: {
    marginBottom: 12,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  saleInfo: {
    flex: 1,
    marginLeft: 12,
  },
  buyerName: {
    color: colors.text.muted,
    marginTop: 2,
  },
  addressText: {
    color: colors.text.muted,
    marginTop: 2,
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
    marginTop: 2,
  },
  actionButtons: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});
