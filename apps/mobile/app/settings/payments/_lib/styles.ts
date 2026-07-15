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
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
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
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[2],
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
    marginTop: theme.spacing[0.5],
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2.5],
    marginBottom: theme.spacing[1.5],
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: 12,
    gap: theme.spacing[1],
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  providerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  providerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: colors.text.subtle,
    marginBottom: theme.spacing[2],
  },
  failureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    backgroundColor: colors.danger[50]!,
    padding: theme.spacing[2],
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing[2],
  },
  failureText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger[600]!,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.xl,
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
