import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3.5],
  },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[3.5],
    backgroundColor: colors.primary[50]!,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.heading,
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  upgradeBtn: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.radius.xl,
  },
  upgradeBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2.5],
  },
  statCard: {
    flexBasis: '48%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[3.5],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.heading,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  actionsCard: {
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: theme.spacing[3],
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickAction: {
    width: '33.333%',
    alignItems: 'center',
    padding: theme.spacing[2],
  },
  quickIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[1.5],
  },
  quickLabel: {
    fontSize: 11,
    color: colors.text.heading,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing[1.5],
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
});
