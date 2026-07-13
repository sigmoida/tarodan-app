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
  button: {
    marginBottom: theme.spacing[2],
    minWidth: 200,
    // Button varsayılanı alignSelf:'flex-start' → ortalı kapsayıcıda sola kayar.
    alignSelf: 'center',
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
    color: colors.text.muted,
    paddingHorizontal: theme.spacing[4],
  },
  browseButton: {
    minWidth: 200,
    alignSelf: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing[4],
  },
  card: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  cardContent: {
    flexDirection: 'row',
    padding: theme.spacing[3],
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
  },
  productImage: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.surface.alt,
  },
  productInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
    justifyContent: 'center',
  },
  productTitle: {
    color: colors.text.heading,
    marginBottom: theme.spacing[1],
  },
  sellerName: {
    color: colors.text.muted,
    marginBottom: theme.spacing[1],
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.radius.md,
    marginTop: theme.spacing[1],
  },
  actions: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationsSection: {
    marginTop: theme.spacing[6],
    width: '100%',
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: theme.spacing[3],
    color: colors.text.heading,
  },
});
