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
    padding: theme.spacing[8],
  },
  headerBadge: {
    marginLeft: theme.spacing[2],
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
  loginButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.xl,
  },
  loginButtonText: {
    color: colors.white,
    fontWeight: '600',
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
    fontSize: 13,
  },
  searchContainer: {
    padding: theme.spacing[3],
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
    padding: theme.spacing[8],
  },
  emptyTitle: {
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
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
    padding: theme.spacing[4],
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
    borderRadius: theme.radius.lg,
    backgroundColor: colors.primary[600]!,
    borderWidth: 2,
    borderColor: colors.surface.DEFAULT,
  },
  threadContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
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
    marginLeft: theme.spacing[2],
  },
  productRef: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[0.5],
  },
  productRefText: {
    color: colors.primary[600]!,
    marginLeft: theme.spacing[1],
    fontSize: 12,
  },
  lastMessage: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  unreadText: {
    fontWeight: '600',
    color: colors.text.heading,
  },
  unreadBadge: {
    marginLeft: theme.spacing[2],
  },
});
