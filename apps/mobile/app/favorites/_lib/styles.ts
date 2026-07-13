import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
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
  button: {
    marginBottom: 8,
    minWidth: 200,
    // Button varsayılanı alignSelf:'flex-start' → ortalı kapsayıcıda sola kayar.
    alignSelf: 'center',
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
    color: colors.text.muted,
    paddingHorizontal: 16,
  },
  browseButton: {
    minWidth: 200,
    alignSelf: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
  },
  productImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productTitle: {
    color: colors.text.heading,
    marginBottom: 4,
  },
  sellerName: {
    color: colors.text.muted,
    marginBottom: 4,
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  actions: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationsSection: {
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text.heading,
  },
});
