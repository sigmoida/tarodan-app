import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Karşı teklif ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  noticeCard: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    backgroundColor: colors.info[50]!,
    borderRadius: theme.radius['2xl'],
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.info[600]!,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
  },
  section: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.subtle,
    marginTop: theme.spacing[2],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2.5],
    marginTop: theme.spacing[2.5],
  },
  gridItem: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius['2xl'],
    borderWidth: 1,
    borderColor: 'transparent',
    padding: theme.spacing[2],
  },
  gridItemSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  gridImgWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.border.DEFAULT,
    position: 'relative',
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay.black20,
    alignItems: 'flex-end',
  },
  checkBadge: {
    margin: theme.spacing[1.5],
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: theme.spacing[1.5],
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginTop: theme.spacing[0.5],
  },
  swapWrap: {
    alignItems: 'center',
    marginVertical: theme.spacing[1],
  },
  swapCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCount: {
    fontSize: 11,
    color: colors.text.subtle,
    textAlign: 'right',
    marginTop: theme.spacing[1],
  },
  chipsRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  chip: {
    flex: 1,
  },
  cashInput: {
    marginTop: theme.spacing[2.5],
    backgroundColor: colors.surface.DEFAULT,
  },
  messageInput: {
    marginTop: theme.spacing[2],
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing[1],
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
  summaryHint: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  submitBtn: {
    borderRadius: theme.radius['2xl'],
    marginTop: theme.spacing[2],
  },
});
