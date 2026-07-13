import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Yardım merkezi ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  content: {
    flex: 1,
  },
  searchSection: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[6],
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  searchTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: theme.spacing[4],
    textAlign: 'center',
  },
  quickLinks: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing[5],
    backgroundColor: colors.surface.DEFAULT,
    marginHorizontal: theme.spacing[4],
    marginTop: -16,
    borderRadius: theme.radius['3xl'],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickLink: {
    alignItems: 'center',
  },
  quickLinkText: {
    marginTop: theme.spacing[2],
    fontSize: 12,
    color: colors.text.heading,
    fontWeight: '500',
  },
  faqSection: {
    padding: theme.spacing[4],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[4],
  },
  faqCategory: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: theme.spacing[3],
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing[4],
  },
  categoryTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  categoryTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  questionCount: {
    backgroundColor: colors.surface.alt,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.radius['2xl'],
  },
  questionCountText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  questionsList: {
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  questionItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing[4],
    paddingLeft: theme.spacing[5],
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.heading,
    marginRight: theme.spacing[3],
  },
  answerText: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 20,
    padding: theme.spacing[4],
    paddingTop: theme.spacing[0],
    paddingLeft: theme.spacing[5],
    backgroundColor: colors.surface.alt,
  },
  divider: {
    marginVertical: theme.spacing[4],
  },
  contactSection: {
    padding: theme.spacing[4],
  },
  contactOptions: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: theme.spacing[4],
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  contactSubtitle: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  contactForm: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[4],
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: theme.spacing[4],
  },
  input: {
    marginBottom: theme.spacing[3],
  },
  submitButton: {
    borderRadius: 12,
    marginTop: theme.spacing[2],
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: theme.spacing[6],
  },
  appInfoText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  appLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[2],
  },
  appLink: {
    fontSize: 13,
    color: colors.primary[600]!,
  },
  appLinkDivider: {
    marginHorizontal: theme.spacing[2],
    color: colors.text.muted,
  },
});
