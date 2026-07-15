import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

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
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: theme.spacing[4],
    color: colors.text.muted,
  },
  content: {
    flex: 1,
    padding: theme.spacing[4],
  },
  coverImageContainer: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  coverImageText: {
    marginTop: theme.spacing[2],
    color: colors.text.muted,
  },
  removeCoverButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.overlay.black50,
  },
  card: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[4],
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: theme.spacing[4],
    color: colors.text.heading,
  },
  templatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  templateItem: {
    width: '30%',
    alignItems: 'center',
    padding: theme.spacing[3],
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.alt,
  },
  templateItemSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  templateIcon: {
    fontSize: 24,
    marginBottom: theme.spacing[1],
  },
  templateName: {
    textAlign: 'center',
    color: colors.text.heading,
  },
  input: {
    marginBottom: theme.spacing[3],
  },
  privacyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  privacyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  privacyText: {
    marginLeft: theme.spacing[3],
  },
  privacyDesc: {
    color: colors.text.muted,
  },
  privateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  privateNoteText: {
    marginLeft: theme.spacing[2],
    color: colors.text.muted,
  },
  tipCard: {
    marginBottom: theme.spacing[4],
    backgroundColor: colors.warning[50]!,
    borderWidth: 1,
    borderColor: colors.warning[200]!,
    padding: theme.spacing[4],
    borderRadius: 12,
  },
  tipContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipText: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  tipDesc: {
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  submitButton: {
    marginBottom: theme.spacing[4],
  },
  premiumRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
    backgroundColor: colors.surface.DEFAULT,
  },
  premiumTitle: {
    marginTop: theme.spacing[6],
    textAlign: 'center',
    color: colors.text.heading,
  },
  premiumSubtitle: {
    marginTop: theme.spacing[2],
    textAlign: 'center',
    color: colors.text.muted,
  },
  premiumFeatures: {
    marginTop: theme.spacing[6],
    alignSelf: 'flex-start',
    width: '100%',
  },
  premiumFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing[2],
  },
  premiumFeatureText: {
    marginLeft: theme.spacing[3],
    color: colors.text.heading,
  },
  upgradeButton: {
    marginTop: theme.spacing[6],
    width: '100%',
  },
});
