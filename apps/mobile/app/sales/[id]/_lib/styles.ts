import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: 16,
    gap: 12,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusSub: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemImg: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginTop: 2,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    justifyContent: 'space-between',
  },
  kvLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  kvValue: {
    flex: 1,
    fontSize: 13,
    color: colors.text.heading,
  },
  addressName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 18,
  },
  helperText: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 6,
    lineHeight: 17,
  },
  actionBtn: {
    borderRadius: 10,
    marginTop: 4,
  },
});
