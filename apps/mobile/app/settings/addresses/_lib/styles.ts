import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, spacing, radius } = theme;

// Adresler ekranının route-local stylesheet'i (monolitten birebir taşındı).
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
  addressCard: {
    marginBottom: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing[2],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addressTitle: {
    marginLeft: theme.spacing[2],
    fontWeight: '600',
  },
  defaultBadge: {
    backgroundColor: colors.success[50]!,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: radius.sm,
    marginLeft: theme.spacing[2],
  },
  defaultBadgeText: {
    color: colors.success[700]!,
    fontSize: 11,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
  },
  addressDetail: {
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  defaultButton: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing[2],
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  dialogScroll: {
    maxHeight: 420,
  },
  input: {
    marginBottom: spacing[3],
  },
  defaultCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[2],
  },
  checkboxLabel: {
    marginLeft: theme.spacing[2],
    color: colors.text.heading,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
});
