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
    padding: theme.spacing[5],
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
  expiryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  expiryText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning[700]!,
    marginLeft: theme.spacing[2],
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  cartItem: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[3],
    flexDirection: 'row',
    marginBottom: theme.spacing[3],
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.surface.alt,
  },
  itemInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  itemSeller: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
    marginTop: theme.spacing[2],
  },
  itemActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[1],
  },
  quantityButton: {
    padding: theme.spacing[2],
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: theme.spacing[3],
    color: colors.text.heading,
  },
  stockHint: {
    fontSize: 11,
    color: colors.warning[600]!,
    marginTop: theme.spacing[1],
  },
  summary: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginTop: theme.spacing[2],
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[4],
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
    padding: theme.spacing[3],
    borderRadius: theme.radius.xl,
    marginTop: theme.spacing[4],
  },
  guestInfoText: {
    flex: 1,
    fontSize: 13,
    color: colors.info[700]!,
    marginLeft: theme.spacing[2],
  },
  checkoutBar: {
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
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
    paddingHorizontal: theme.spacing[6],
  },
});
