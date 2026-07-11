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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  list: {
    flex: 1,
  },
  discountCard: {
    backgroundColor: colors.white,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  discountName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.heading,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
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
    marginBottom: 8,
  },
  metaRow: {
    gap: 6,
    marginVertical: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    paddingTop: 8,
    marginTop: 8,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginBottom: 10,
  },
  dateInput: {
    flex: 1,
    marginBottom: 0,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    marginTop: 8,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  productPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface.alt,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  productPickerText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.heading,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: colors.text.heading,
  },
  emptyProducts: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingVertical: 24,
    fontSize: 14,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    marginTop: 2,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
