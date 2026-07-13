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
    padding: 32,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 16,
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
    marginTop: 8,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
    gap: 8,
  },
  categoryItem: {
    width: '31%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  categoryItemText: {
    marginTop: 8,
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
    gap: 8,
    marginBottom: 24,
  },
  formCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  note: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  userInfoCard: {
    backgroundColor: colors.surface.alt,
    marginBottom: 24,
  },
  userInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: 12,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userInfoText: {
    marginLeft: 10,
    fontSize: 14,
    color: colors.text.heading,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 16,
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
