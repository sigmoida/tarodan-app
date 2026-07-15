import { StyleSheet, Dimensions } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;
const { width } = Dimensions.get('window');
export const CARD_WIDTH = (width - 48) / 2;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  filterSection: {
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  searchBar: {
    marginBottom: theme.spacing[3],
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: theme.spacing[3],
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.xl,
    backgroundColor: colors.gray[50],
  },
  sortButtonText: {
    marginLeft: theme.spacing[1.5],
    fontSize: 13,
    color: colors.text.muted,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  menuItemText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  scaleChips: {
    marginBottom: theme.spacing[1],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing[3],
    color: colors.text.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  emptyTitle: {
    marginTop: theme.spacing[4],
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  emptySubtitle: {
    marginTop: theme.spacing[2],
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
  },
  productsContainer: {
    flex: 1,
  },
  productsContent: {
    padding: theme.spacing[4],
  },
  resultsCount: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: theme.spacing[3],
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: theme.spacing[4],
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  productImageContainer: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH * 0.9,
    backgroundColor: colors.gray[50],
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success[500]!,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.md,
  },
  tradeBadgeText: {
    marginLeft: theme.spacing[1],
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  likesContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay.white90,
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: 3,
    borderRadius: theme.radius.md,
  },
  likesText: {
    marginLeft: theme.spacing[1],
    fontSize: 11,
    color: colors.text.muted,
  },
  productContent: {
    padding: theme.spacing[3],
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: theme.spacing[1],
  },
  productMeta: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: theme.spacing[2],
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
});
