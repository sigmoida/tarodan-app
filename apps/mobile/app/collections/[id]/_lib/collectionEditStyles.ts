import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Koleksiyon düzenleme ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  coverImageContainer: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  coverImageText: {
    marginTop: 8,
    color: colors.text.muted,
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.overlay.black50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  coverOverlayText: {
    color: colors.white,
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  card: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  input: {
    marginBottom: 12,
  },
  privacyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  privacyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  privacyText: {
    marginLeft: 12,
  },
  privacyDesc: {
    color: colors.text.muted,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyItems: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    marginTop: 8,
    color: colors.text.muted,
  },
  collectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: colors.border.DEFAULT,
  },
  itemTitle: {
    flex: 1,
    marginLeft: 12,
    color: colors.text.heading,
  },
  saveButton: {
    marginBottom: 16,
  },
  dangerCard: {
    marginBottom: 16,
    backgroundColor: colors.danger[50]!,
    borderWidth: 1,
    borderColor: colors.danger[200]!,
    padding: 16,
    borderRadius: 12,
  },
  dangerTitle: {
    marginBottom: 8,
    color: colors.danger[600]!,
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dangerItemTitle: {
    color: colors.danger[600]!,
    fontWeight: '600',
  },
  dangerItemDesc: {
    color: colors.text.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
