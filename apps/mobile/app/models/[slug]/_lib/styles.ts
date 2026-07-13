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
    padding: 16,
    backgroundColor: colors.overlay.black50,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
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
    marginTop: 2,
  },
  descriptionWrap: {
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.heading,
  },
  productsSection: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: 12,
  },
  productsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
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
    paddingHorizontal: 16,
    gap: 12,
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
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
    padding: 10,
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
    marginTop: 4,
  },
  productCondition: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
});
