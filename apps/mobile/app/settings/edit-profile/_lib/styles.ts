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
    gap: 16,
  },
  saveButton: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
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
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface.elevated,
  },
  membershipSection: {
    marginBottom: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  input: {
    marginBottom: 12,
  },
  hintText: {
    color: colors.text.muted,
    marginTop: 4,
  },
  warningText: {
    color: colors.primary[600]!,
    marginTop: -6,
    marginBottom: 8,
  },
  premiumFeatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumFeatureTitle: {
    marginLeft: 8,
    color: colors.primary[700]!,
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tierBadge: {
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    padding: 12,
    borderRadius: radius.md,
    marginTop: 4,
  },
  infoBoxText: {
    color: colors.info[700]!,
  },
  submitButton: {
    marginTop: 8,
  },
});
