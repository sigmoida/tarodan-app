import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  expiryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  expiryText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning[700]!,
    marginLeft: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  cartItem: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 12,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  itemSeller: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
    marginTop: 8,
  },
  itemActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
    padding: 4,
  },
  quantityButton: {
    padding: 8,
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    color: colors.text.heading,
  },
  stockHint: {
    fontSize: 11,
    color: colors.warning[600]!,
    marginTop: 4,
  },
  summary: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
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
  guestInfo: {
    flexDirection: 'row',
    backgroundColor: colors.info[50]!,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  guestInfoText: {
    flex: 1,
    fontSize: 13,
    color: colors.info[700]!,
    marginLeft: 8,
  },
  checkoutBar: {
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  checkoutTotal: {
    flex: 1,
  },
  checkoutLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  checkoutPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  checkoutButton: {
    borderRadius: 12,
    paddingHorizontal: 24,
  },
});
