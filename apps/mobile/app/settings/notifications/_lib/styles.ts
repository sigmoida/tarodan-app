import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
    backgroundColor: colors.surface.DEFAULT,
  },
  saveButton: {
    color: colors.white,
    fontWeight: '600',
  },
  title: {
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing[6],
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  card: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  sectionTitle: {
    marginLeft: theme.spacing[3],
  },
  divider: {
    marginVertical: theme.spacing[2],
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
  },
  settingContent: {
    flex: 1,
    marginHorizontal: theme.spacing[3],
  },
  settingDescription: {
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.info[50]!,
    padding: theme.spacing[3],
    borderRadius: radius.md,
    gap: theme.spacing[2],
  },
  infoText: {
    flex: 1,
    color: colors.info[600]!,
    fontSize: 13,
  },
});
