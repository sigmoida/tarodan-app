import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    borderRadius: 999,
  },
  tierText: {
    color: colors.primary[600]!,
    fontWeight: '700',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  activeText: {
    color: colors.success[600]!,
    fontWeight: '600',
    fontSize: 13,
  },
  cancelledNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
    padding: theme.spacing[2.5],
    backgroundColor: colors.warning[50]!,
    borderRadius: theme.radius['2xl'],
  },
  cancelledNoteText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 12,
    lineHeight: 17,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[1],
  },
  kvLabel: {
    color: colors.text.muted,
    fontSize: 13,
  },
  kvValue: {
    color: colors.text.heading,
    fontWeight: '600',
    fontSize: 13,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  autoTitle: {
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: theme.spacing[0.5],
  },
  autoSub: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 17,
  },
  helperText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[3],
    lineHeight: 18,
  },
  actionBtn: {
    borderRadius: theme.radius['2xl'],
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    backgroundColor: colors.info[50]!,
    borderRadius: theme.radius['2xl'],
    marginTop: theme.spacing[1],
  },
  helpText: {
    flex: 1,
    color: colors.info[600]!,
    fontSize: 12,
    lineHeight: 17,
  },
});
