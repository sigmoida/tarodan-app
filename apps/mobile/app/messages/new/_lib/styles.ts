import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  sectionTitle: {
    marginBottom: theme.spacing[2],
    color: colors.text.heading,
  },
  recipientSection: {
    marginBottom: theme.spacing[6],
  },
  loadingContainer: {
    padding: theme.spacing[4],
    alignItems: 'center',
  },
  searchResults: {
    marginTop: theme.spacing[2],
    borderRadius: theme.radius.xl,
    backgroundColor: colors.surface.alt,
    overflow: 'hidden',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  userInfo: {
    marginLeft: theme.spacing[3],
  },
  sellerBadge: {
    color: colors.primary[600]!,
  },
  noResults: {
    textAlign: 'center',
    marginTop: theme.spacing[4],
    color: colors.text.muted,
  },
  selectedRecipient: {
    marginBottom: theme.spacing[6],
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[3],
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius.xl,
  },
  recipientName: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  productSection: {
    marginBottom: theme.spacing[6],
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[3],
    backgroundColor: colors.primary[50]!,
    borderRadius: theme.radius.xl,
  },
  productTitle: {
    flex: 1,
    marginHorizontal: theme.spacing[2],
    color: colors.text.heading,
  },
  productPrice: {
    fontWeight: '600',
    color: colors.primary[600]!,
  },
  messageSection: {
    flex: 1,
  },
  messageInputContainer: {
    flex: 1,
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[3],
    minHeight: 150,
  },
  messageInput: {
    flex: 1,
    fontSize: 16,
    textAlignVertical: 'top',
    color: colors.text.heading,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[2],
  },
  limitWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: theme.spacing[3],
    borderRadius: theme.radius.xl,
    marginTop: theme.spacing[3],
    gap: theme.spacing[2],
  },
  limitWarningText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 13,
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  footer: {
    padding: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  sendButton: {
    borderRadius: theme.radius.xl,
  },
});
