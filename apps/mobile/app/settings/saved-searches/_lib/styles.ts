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
  headerCount: {
    color: colors.white,
    opacity: 0.8,
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
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  limitText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 13,
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  searchCard: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  searchName: {
    marginLeft: theme.spacing[2],
  },
  queryText: {
    color: colors.text.heading,
    marginTop: theme.spacing[2],
    fontStyle: 'italic',
  },
  filtersText: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  divider: {
    marginVertical: theme.spacing[3],
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaInfo: {
    flex: 1,
  },
  metaText: {
    color: colors.text.muted,
  },
  notifyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  notifyText: {
    marginLeft: theme.spacing[2],
    color: colors.text.muted,
    fontSize: 13,
  },
  notifyTextActive: {
    color: colors.primary[600]!,
  },
});
