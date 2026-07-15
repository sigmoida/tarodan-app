import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12) — models tarama listesi. Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  searchWrap: {
    backgroundColor: colors.surface.DEFAULT,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  brandFilterScroll: {
    backgroundColor: colors.surface.DEFAULT,
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  brandFilterRow: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  brandSection: {
    backgroundColor: colors.surface.DEFAULT,
    marginTop: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[3],
    gap: theme.spacing[3],
  },
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[50],
  },
  brandLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.heading,
  },
  brandMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  modelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing[3],
    gap: theme.spacing[2],
  },
  modelCard: {
    width: '48%',
    backgroundColor: colors.gray[50],
    borderRadius: theme.radius['2xl'],
    overflow: 'hidden',
    marginBottom: theme.spacing[2],
  },
  modelImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.border.subtle,
  },
  modelImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelBody: {
    padding: theme.spacing[2.5],
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  modelYears: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  modelCount: {
    fontSize: 11,
    color: colors.primary[600]!,
    fontWeight: '600',
    marginTop: theme.spacing[0.5],
  },
});
