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
    padding: 16,
    gap: 12,
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
    gap: 6,
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tierText: {
    color: colors.primary[600]!,
    fontWeight: '700',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeText: {
    color: colors.success[600]!,
    fontWeight: '600',
    fontSize: 13,
  },
  cancelledNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 10,
    backgroundColor: colors.warning[50]!,
    borderRadius: 10,
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
    paddingVertical: 4,
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
    gap: 12,
  },
  autoTitle: {
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 2,
  },
  autoSub: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 17,
  },
  helperText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 12,
    lineHeight: 18,
  },
  actionBtn: {
    borderRadius: 10,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.info[50]!,
    borderRadius: 10,
    marginTop: 4,
  },
  helpText: {
    flex: 1,
    color: colors.info[600]!,
    fontSize: 12,
    lineHeight: 17,
  },
});
