import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  scrollBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  productCard: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.gray[50],
  },
  productBody: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing[1],
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.heading,
  },
  listPrice: {
    fontSize: 13,
    color: colors.text.muted,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius['2xl'],
  },
  statusBannerText: {
    fontWeight: '700',
  },
  amountCard: {
    padding: theme.spacing[4],
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  amountLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary[700]!,
    marginTop: theme.spacing[1],
  },
  counterValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.info[600]!,
    marginTop: theme.spacing[1],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: theme.spacing[2.5],
  },
  messageCard: {
    padding: theme.spacing[3.5],
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: theme.spacing[2],
  },
  messageText: {
    fontSize: 14,
    color: colors.text.heading,
    lineHeight: 20,
  },
  partyCard: {
    padding: theme.spacing[3.5],
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
    gap: theme.spacing[2],
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  partyLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  partyName: {
    fontSize: 13,
    color: colors.text.heading,
    fontWeight: '600',
    flex: 1,
  },
  actionsStack: {
    gap: theme.spacing[2.5],
    marginTop: theme.spacing[2],
  },
  actionBtn: {
    borderRadius: theme.radius['2xl'],
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
});
