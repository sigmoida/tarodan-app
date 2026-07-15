import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  authRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  authTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  authSubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
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
    marginTop: theme.spacing[2],
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing[6],
    gap: theme.spacing[2],
  },
  categoryItem: {
    width: '31%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[4],
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  categoryItemText: {
    marginTop: theme.spacing[2],
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  categoryItemTextActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[6],
  },
  formCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: theme.spacing[4],
  },
  input: {
    marginBottom: theme.spacing[3],
  },
  note: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  userInfoCard: {
    backgroundColor: colors.surface.alt,
    marginBottom: theme.spacing[6],
  },
  userInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: theme.spacing[3],
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  userInfoText: {
    marginLeft: theme.spacing[2.5],
    fontSize: 14,
    color: colors.text.heading,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: theme.spacing[1],
    marginBottom: theme.spacing[4],
  },
  contactInfo: {
    alignItems: 'center',
  },
  contactInfoText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  contactInfoLink: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
