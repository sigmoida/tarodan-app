import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  errorText: {
    color: colors.text.muted,
  },
  body: {
    padding: theme.spacing[4],
  },
  card: {
    marginBottom: theme.spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.DEFAULT,
    marginTop: theme.spacing[2.5],
    paddingTop: theme.spacing[2],
  },
  muted: {
    color: colors.text.muted,
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  itemContent: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing[3],
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  itemInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
    gap: theme.spacing[0.5],
  },
  shipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    margin: theme.spacing[3],
    marginTop: theme.spacing[2.5],
    padding: theme.spacing[2.5],
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  shipmentText: {
    flex: 1,
    color: colors.text.heading,
    fontWeight: '600',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
  },
  noteText: {
    flex: 1,
    color: colors.text.muted,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    marginHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[3],
    paddingTop: theme.spacing[1],
  },
  actionText: {
    flex: 1,
    color: colors.primary[600]!,
    fontWeight: '600',
  },
});
