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
    padding: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
    gap: 8,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
  },
  collectionRow: {
    justifyContent: 'space-between',
  },
  collectionCard: {
    width: (width - 48) / 2,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: 16,
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
    padding: 8,
  },
  collectionStats: {
    flexDirection: 'row',
    gap: 12,
  },
  collectionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionStatText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '600',
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 4,
  },
  collectionDescription: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 8,
    lineHeight: 16,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerName: {
    fontSize: 12,
    color: colors.text.muted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.info[50]!,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.info[600]!,
  },
  infoText: {
    fontSize: 13,
    color: colors.info[800]!,
    marginTop: 4,
    lineHeight: 18,
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  infoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[600]!,
  },
});
