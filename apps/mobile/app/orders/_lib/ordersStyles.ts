import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// Siparişlerim ekranının route-local stylesheet'i (monolitten birebir taşındı).
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
    color: colors.text.muted,
  },
  filterContainer: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterChipSpacing: {
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
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  emptyButton: {
    alignSelf: 'center',
    paddingHorizontal: 32,
  },
  ordersList: {
    flex: 1,
    padding: 16,
  },
  orderCard: {
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 8,
  },
  orderNumber: {
    color: colors.text.muted,
  },
  orderContent: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 0,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  productImageSm: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  groupItemsBand: {
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary[300]!,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerName: {
    color: colors.text.muted,
    marginTop: 4,
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
    marginTop: 4,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    marginTop: 8,
    paddingTop: 8,
  },
  dateText: {
    color: colors.text.muted,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackButtonText: {
    color: colors.primary[600]!,
    marginLeft: 4,
    fontWeight: '500',
  },
  ratingSection: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 0,
    gap: 8,
    flexWrap: 'wrap',
  },
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
    borderWidth: 2,
    borderColor: colors.surface.DEFAULT,
  },
  thumbOverlap: {
    marginLeft: -18,
  },
  thumbMore: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  thumbMoreText: {
    color: colors.text.muted,
    fontWeight: '700',
  },
  groupFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateButton: {
    borderColor: colors.primary[600]!,
  },
});
