import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors, radius } = theme;

// Route-local paylaşılan stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  saveButton: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary[600]!,
    width: 32,
    height: 32,
    borderRadius: theme.radius['3xl'],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface.elevated,
  },
  membershipSection: {
    marginBottom: theme.spacing[4],
  },
  card: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: theme.spacing[4],
    color: colors.text.heading,
  },
  input: {
    marginBottom: theme.spacing[3],
  },
  hintText: {
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  warningText: {
    color: colors.primary[600]!,
    marginTop: -6,
    marginBottom: theme.spacing[2],
  },
  premiumFeatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumFeatureTitle: {
    marginLeft: theme.spacing[2],
    color: colors.primary[700]!,
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[4],
  },
  tierBadge: {
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: radius.full ?? 999,
  },
  tierBadgeText: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: colors.info[50]!,
    borderWidth: 1,
    borderColor: colors.info[100]!,
    padding: theme.spacing[3],
    borderRadius: radius.md,
    marginTop: theme.spacing[1],
  },
  infoBoxText: {
    color: colors.info[700]!,
  },
  submitButton: {
    marginTop: theme.spacing[2],
  },
});
