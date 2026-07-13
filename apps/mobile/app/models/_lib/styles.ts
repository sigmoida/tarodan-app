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
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
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
    marginTop: 12,
    paddingVertical: 12,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
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
    marginTop: 2,
  },
  modelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
  },
  modelCard: {
    width: '48%',
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
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
    padding: 10,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  modelYears: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  modelCount: {
    fontSize: 11,
    color: colors.primary[600]!,
    fontWeight: '600',
    marginTop: 2,
  },
});
