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
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  searchTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 16,
    textAlign: 'center',
  },
  quickLinks: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    backgroundColor: colors.surface.DEFAULT,
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 16,
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
    marginTop: 8,
    fontSize: 12,
    color: colors.text.heading,
    fontWeight: '500',
  },
  faqSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
  },
  faqCategory: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  questionCount: {
    backgroundColor: colors.surface.alt,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
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
    padding: 16,
    paddingLeft: 20,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.heading,
    marginRight: 12,
  },
  answerText: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 20,
    padding: 16,
    paddingTop: 0,
    paddingLeft: 20,
    backgroundColor: colors.surface.alt,
  },
  divider: {
    marginVertical: 16,
  },
  contactSection: {
    padding: 16,
  },
  contactOptions: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: 16,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
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
    marginLeft: 12,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  contactSubtitle: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 2,
  },
  contactForm: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  submitButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appInfoText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  appLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  appLink: {
    fontSize: 13,
    color: colors.primary[600]!,
  },
  appLinkDivider: {
    marginHorizontal: 8,
    color: colors.text.muted,
  },
});
