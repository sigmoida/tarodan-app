import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  headerBadge: {
    marginLeft: 8,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  loginButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    gap: 8,
  },
  limitText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 13,
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
    fontSize: 13,
  },
  searchContainer: {
    padding: 12,
    backgroundColor: colors.surface.DEFAULT,
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
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    color: colors.text.muted,
  },
  threadsList: {
    flex: 1,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  threadItemUnread: {
    backgroundColor: colors.primary[50]!,
  },
  avatarContainer: {
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary[600]!,
    borderWidth: 2,
    borderColor: colors.surface.DEFAULT,
  },
  threadContent: {
    flex: 1,
    marginLeft: 12,
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantName: {
    flex: 1,
    color: colors.text.heading,
  },
  threadTime: {
    color: colors.text.muted,
    marginLeft: 8,
  },
  productRef: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  productRefText: {
    color: colors.primary[600]!,
    marginLeft: 4,
    fontSize: 12,
  },
  lastMessage: {
    color: colors.text.muted,
    marginTop: 4,
  },
  unreadText: {
    fontWeight: '600',
    color: colors.text.heading,
  },
  unreadBadge: {
    marginLeft: 8,
  },
});
