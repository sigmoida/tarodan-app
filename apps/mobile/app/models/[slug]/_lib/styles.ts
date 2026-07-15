import { StyleSheet, Dimensions } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;
const { width } = Dimensions.get('window');
export const CARD_WIDTH = (width - 16 * 2 - 12) / 2; // 2 sütun, 16 padding, 12 gap

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hero: {
    position: 'relative',
    backgroundColor: colors.gray[50],
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing[4],
    backgroundColor: colors.overlay.black50,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  brandLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  brandName: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '600',
    opacity: 0.9,
  },
  modelName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
  },
  yearLabel: {
    fontSize: 13,
    color: colors.white,
    opacity: 0.8,
    marginTop: theme.spacing[0.5],
  },
  descriptionWrap: {
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.heading,
  },
  productsSection: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: theme.spacing[3],
  },
  productsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.heading,
  },
  productCount: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.gray[50],
    borderRadius: theme.radius['2xl'],
    overflow: 'hidden',
    marginBottom: theme.spacing[3],
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.border.subtle,
  },
  productImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBody: {
    padding: theme.spacing[2.5],
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.heading,
    minHeight: 34,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.primary[600]!,
    marginTop: theme.spacing[1],
  },
  productCondition: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
});
