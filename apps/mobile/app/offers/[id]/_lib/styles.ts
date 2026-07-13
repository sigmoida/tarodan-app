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
    padding: 16,
    gap: 12,
  },
  productCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.gray[50],
  },
  productBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
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
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  statusBannerText: {
    fontWeight: '700',
  },
  amountCard: {
    padding: 16,
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
    marginTop: 4,
  },
  counterValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.info[600]!,
    marginTop: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: 10,
  },
  messageCard: {
    padding: 14,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: colors.text.heading,
    lineHeight: 20,
  },
  partyCard: {
    padding: 14,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
    gap: 8,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    borderRadius: 10,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});
