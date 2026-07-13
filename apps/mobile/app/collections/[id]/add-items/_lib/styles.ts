import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  searchBar: {
    padding: 16,
    paddingBottom: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.border.DEFAULT,
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  rowPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
    marginTop: 4,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnAdded: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
});
