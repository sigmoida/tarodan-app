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
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2.5],
    padding: theme.spacing[3.5],
    borderRadius: 12,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusSub: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: theme.spacing[0.5],
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[3.5],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: theme.spacing[2.5],
  },
  itemRow: {
    flexDirection: 'row',
    gap: theme.spacing[2.5],
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
  },
  itemImg: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.xl,
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
    marginTop: theme.spacing[0.5],
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginTop: theme.spacing[0.5],
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
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
    marginBottom: theme.spacing[1],
  },
  addressLine: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 18,
  },
  helperText: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[1.5],
    lineHeight: 17,
  },
  actionBtn: {
    borderRadius: theme.radius['2xl'],
    marginTop: theme.spacing[1],
  },
});
