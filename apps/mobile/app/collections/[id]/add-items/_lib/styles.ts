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
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  emptyText: {
    marginTop: theme.spacing[3],
    color: colors.text.muted,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: theme.spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: theme.spacing[2.5],
    marginBottom: theme.spacing[2.5],
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.border.DEFAULT,
  },
  rowInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
    marginRight: theme.spacing[2],
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
    marginTop: theme.spacing[1],
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
