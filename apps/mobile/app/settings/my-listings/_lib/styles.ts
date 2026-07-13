import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// İlan yönetimi ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  limitCard: {
    margin: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: radius.sm,
  },
  filterContainer: {
    backgroundColor: colors.white,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  chipRow: {
    gap: theme.spacing[2],
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
  listingCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: theme.spacing[3],
    flexDirection: 'row',
    marginBottom: theme.spacing[3],
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  listingImage: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  listingInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  listingTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
    marginTop: theme.spacing[1],
  },
  listingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[2],
    flexWrap: 'wrap',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing[4],
  },
  statText: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: theme.spacing[1],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: radius.lg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: theme.spacing[1],
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  expiryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[1.5],
  },
  expiryText: {
    fontSize: 11,
    color: colors.warning[600]!,
    marginLeft: theme.spacing[1],
  },
  dateText: {
    fontSize: 11,
    color: colors.text.subtle,
    marginTop: theme.spacing[1],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: theme.spacing[4],
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: theme.spacing[2],
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  menuItemText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
});
