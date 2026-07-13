import { StyleSheet, Dimensions } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;
const { width } = Dimensions.get('window');

// Route-local stylesheet (§12) — koleksiyon tarama listesi. Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  searchSection: {
    padding: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
    gap: theme.spacing[2],
  },
  content: {
    flex: 1,
  },
  section: {
    padding: theme.spacing[4],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[4],
  },
  collectionRow: {
    justifyContent: 'space-between',
  },
  collectionCard: {
    width: (width - 48) / 2,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: theme.spacing[4],
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  collectionImage: {
    width: '100%',
    height: 120,
  },
  collectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: colors.overlay.black20,
    justifyContent: 'flex-end',
    padding: theme.spacing[2],
  },
  collectionStats: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  collectionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  collectionStatText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '600',
  },
  collectionInfo: {
    padding: theme.spacing[3],
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: theme.spacing[1],
  },
  collectionDescription: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: theme.spacing[2],
    lineHeight: 16,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
  },
  ownerName: {
    fontSize: 12,
    color: colors.text.muted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing[10],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: theme.spacing[2],
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.info[50]!,
    marginHorizontal: theme.spacing[4],
    borderRadius: 12,
    padding: theme.spacing[4],
  },
  infoContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.info[600]!,
  },
  infoText: {
    fontSize: 13,
    color: colors.info[800]!,
    marginTop: theme.spacing[1],
    lineHeight: 18,
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[2],
    gap: theme.spacing[1],
  },
  infoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[600]!,
  },
});
