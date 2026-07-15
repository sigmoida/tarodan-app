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
    padding: theme.spacing[4],
  },
  coverImageContainer: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: theme.spacing[4],
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
    marginTop: theme.spacing[2],
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
    padding: theme.spacing[2],
  },
  coverOverlayText: {
    color: colors.white,
    marginLeft: theme.spacing[2],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
    borderRadius: 12,
    marginBottom: theme.spacing[4],
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  card: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: theme.spacing[4],
    color: colors.text.heading,
  },
  input: {
    marginBottom: theme.spacing[3],
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
    marginLeft: theme.spacing[3],
  },
  privacyDesc: {
    color: colors.text.muted,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  emptyItems: {
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  emptyText: {
    marginTop: theme.spacing[2],
    color: colors.text.muted,
  },
  collectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
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
    borderRadius: theme.radius.lg,
    backgroundColor: colors.border.DEFAULT,
  },
  itemTitle: {
    flex: 1,
    marginLeft: theme.spacing[3],
    color: colors.text.heading,
  },
  saveButton: {
    marginBottom: theme.spacing[4],
  },
  dangerCard: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.danger[50]!,
    borderWidth: 1,
    borderColor: colors.danger[200]!,
    padding: theme.spacing[4],
    borderRadius: 12,
  },
  dangerTitle: {
    marginBottom: theme.spacing[2],
    color: colors.danger[600]!,
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
  },
  dangerItemTitle: {
    color: colors.danger[600]!,
    fontWeight: '600',
  },
  dangerItemDesc: {
    color: colors.text.muted,
    fontSize: 12,
    marginTop: theme.spacing[0.5],
  },
});
