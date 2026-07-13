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
    marginTop: 12,
    fontSize: 14,
    color: colors.text.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
    lineHeight: 20,
  },
  loginButton: {
    marginTop: 24,
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  browseButton: {
    marginTop: 24,
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
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
    padding: 8,
  },
  collectionStats: {
    flexDirection: 'row',
    backgroundColor: colors.overlay.black50,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  collectionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  collectionStatText: {
    fontSize: 11,
    color: colors.white,
    marginLeft: 4,
  },
  unlikeButton: {
    backgroundColor: colors.overlay.black50,
    borderRadius: 16,
    padding: 6,
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ownerName: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
});
