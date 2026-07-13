import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing[3],
    fontSize: 14,
    color: colors.text.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[8],
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
    lineHeight: 20,
  },
  loginButton: {
    marginTop: theme.spacing[6],
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.xl,
  },
  loginButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: theme.spacing[6],
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.xl,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  browseButton: {
    marginTop: theme.spacing[6],
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.xl,
  },
  browseButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.spacing[2],
  },
  collectionCard: {
    width: '48%',
    margin: '1%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  collectionImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.gray[100],
  },
  collectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: theme.spacing[2],
  },
  collectionStats: {
    flexDirection: 'row',
    backgroundColor: colors.overlay.black50,
    borderRadius: 12,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  collectionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing[2],
  },
  collectionStatText: {
    fontSize: 11,
    color: colors.white,
    marginLeft: theme.spacing[1],
  },
  unlikeButton: {
    backgroundColor: colors.overlay.black50,
    borderRadius: theme.radius['3xl'],
    padding: theme.spacing[1.5],
  },
  collectionInfo: {
    padding: theme.spacing[3],
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ownerName: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
});
