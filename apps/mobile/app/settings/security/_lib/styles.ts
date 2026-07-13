import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Güvenlik ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: theme.spacing[2],
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[2],
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: theme.spacing[4],
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.heading,
  },
  settingSubtitle: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  infoText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[3],
    lineHeight: 18,
  },
  tipsCard: {
    backgroundColor: colors.gray[100],
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  tipText: {
    marginLeft: theme.spacing[3],
    fontSize: 14,
    color: colors.text.heading,
  },
  dialogInput: {
    marginBottom: theme.spacing[3],
  },
  dialogText: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: theme.spacing[4],
    lineHeight: 20,
  },
  secretContainer: {
    backgroundColor: colors.gray[100],
    padding: theme.spacing[3],
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing[4],
  },
  secretText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.text.heading,
    textAlign: 'center',
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[2],
  },
  verifiedText: {
    color: colors.success[600]!,
    fontWeight: '600',
  },
});
