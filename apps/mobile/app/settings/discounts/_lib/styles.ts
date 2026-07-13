import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// İndirim yönetimi ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  gateContainer: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  list: {
    flex: 1,
  },
  discountCard: {
    backgroundColor: colors.white,
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing[2],
  },
  discountName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.heading,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginTop: theme.spacing[1],
  },
  codeText: {
    color: colors.primary[600]!,
    fontSize: 12,
    fontWeight: '600',
  },
  valueWrap: {
    alignItems: 'flex-end',
  },
  valueText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  valueLabel: {
    fontSize: 11,
    color: colors.text.muted,
  },
  discountDesc: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: theme.spacing[2],
  },
  metaRow: {
    gap: theme.spacing[1.5],
    marginVertical: theme.spacing[2],
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
  },
  metaText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  activeLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  dialogScroll: {
    maxHeight: 460,
  },
  input: {
    marginBottom: theme.spacing[2.5],
  },
  dateInput: {
    flex: 1,
    marginBottom: theme.spacing[0],
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[1.5],
  },
  toggleRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2.5],
  },
  productPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2.5],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3.5],
    backgroundColor: colors.surface.alt,
    borderRadius: radius.md,
    marginBottom: theme.spacing[2.5],
  },
  productPickerText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.heading,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    gap: theme.spacing[2.5],
    marginBottom: theme.spacing[2.5],
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
  },
  switchLabel: {
    fontSize: 14,
    color: colors.text.heading,
  },
  emptyProducts: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingVertical: theme.spacing[6],
    fontSize: 14,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
  },
  productPrice: {
    fontSize: 13,
    color: colors.primary[600]!,
    marginTop: theme.spacing[0.5],
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
});
