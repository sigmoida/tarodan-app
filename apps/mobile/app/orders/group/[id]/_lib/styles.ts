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
    padding: 24,
    gap: 12,
  },
  errorText: {
    color: colors.text.muted,
  },
  body: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.DEFAULT,
    marginTop: 10,
    paddingTop: 8,
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
    padding: 12,
    paddingBottom: 8,
  },
  itemContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
  },
  shipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: 12,
    marginTop: 10,
    padding: 10,
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
    gap: 8,
  },
  noteText: {
    flex: 1,
    color: colors.text.muted,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingTop: 4,
  },
  actionText: {
    flex: 1,
    color: colors.primary[600]!,
    fontWeight: '600',
  },
});
