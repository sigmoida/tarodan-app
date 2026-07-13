import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  listContent: {
    padding: theme.spacing[4],
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: theme.spacing[4],
  },
  statusIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing[3],
  },
  productImage: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.xl,
    marginRight: theme.spacing[3],
    backgroundColor: theme.colors.gray[100],
  },
  paymentInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  paymentDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.gray[900],
    marginBottom: theme.spacing[0.5],
  },
  paymentDate: {
    fontSize: 13,
    color: theme.colors.gray[600],
  },
  paymentMethod: {
    fontSize: 12,
    color: theme.colors.gray[400],
    marginTop: theme.spacing[0.5],
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.gray[900],
    marginBottom: theme.spacing[1],
  },
  statusBadge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: theme.radius['2xl'],
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing[10],
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.gray[900],
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[1.5],
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.gray[600],
    textAlign: 'center',
  },
  loginButton: {
    marginTop: theme.spacing[5],
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius['2xl'],
  },
  loginButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
