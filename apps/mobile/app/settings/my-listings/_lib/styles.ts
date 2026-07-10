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
    margin: 16,
    marginBottom: 8,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  chipRow: {
    gap: 8,
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
  listingCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 12,
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
    marginLeft: 12,
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
    marginTop: 4,
  },
  listingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statText: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  expiryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  expiryText: {
    fontSize: 11,
    color: colors.warning[600]!,
    marginLeft: 4,
  },
  dateText: {
    fontSize: 11,
    color: colors.text.subtle,
    marginTop: 4,
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
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 8,
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
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
