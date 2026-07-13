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
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    color: colors.text.heading,
  },
  recipientSection: {
    marginBottom: 24,
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  searchResults: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
    overflow: 'hidden',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  userInfo: {
    marginLeft: 12,
  },
  sellerBadge: {
    color: colors.primary[600]!,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 16,
    color: colors.text.muted,
  },
  selectedRecipient: {
    marginBottom: 24,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
  },
  recipientName: {
    flex: 1,
    marginLeft: 12,
  },
  productSection: {
    marginBottom: 24,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.primary[50]!,
    borderRadius: 8,
  },
  productTitle: {
    flex: 1,
    marginHorizontal: 8,
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
    borderRadius: 8,
    padding: 12,
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
    marginTop: 8,
  },
  limitWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
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
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  sendButton: {
    borderRadius: 8,
  },
});
