import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  filterScroll: {
    backgroundColor: colors.surface.DEFAULT,
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    // Chip variant handles bg/fg states
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  paymentCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  providerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  providerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: colors.text.subtle,
    marginBottom: 8,
  },
  failureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.danger[50]!,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  failureText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger[600]!,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButton: {
    borderColor: colors.danger[600]!,
    backgroundColor: colors.danger[50]!,
  },
  retryButton: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  viewButton: {
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
