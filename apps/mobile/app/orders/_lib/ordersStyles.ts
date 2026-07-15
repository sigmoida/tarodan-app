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
    color: colors.text.muted,
  },
  filterContainer: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterChipSpacing: {
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
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing[6],
    color: colors.text.muted,
  },
  emptyButton: {
    alignSelf: 'center',
    paddingHorizontal: theme.spacing[8],
  },
  ordersList: {
    flex: 1,
    padding: theme.spacing[4],
  },
  orderCard: {
    marginBottom: theme.spacing[3],
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  orderNumber: {
    color: colors.text.muted,
  },
  orderContent: {
    flexDirection: 'row',
    padding: theme.spacing[3],
    paddingTop: theme.spacing[0],
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
    marginLeft: theme.spacing[3],
    paddingLeft: theme.spacing[3],
    borderLeftWidth: 2,
    borderLeftColor: colors.primary[300]!,
  },
  productInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  sellerName: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
    marginTop: theme.spacing[1],
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    marginTop: theme.spacing[2],
    paddingTop: theme.spacing[2],
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
    marginLeft: theme.spacing[1],
    fontWeight: '500',
  },
  ratingSection: {
    flexDirection: 'row',
    padding: theme.spacing[3],
    paddingTop: theme.spacing[0],
    gap: theme.spacing[2],
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
    gap: theme.spacing[2],
  },
  rateButton: {
    borderColor: colors.primary[600]!,
  },
});
