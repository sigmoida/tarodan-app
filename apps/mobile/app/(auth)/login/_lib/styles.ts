import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Giriş ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    backgroundColor: colors.primary[600]!,
  },
  brandHeader: {
    alignItems: 'center',
    gap: theme.spacing[2.5],
  },
  footerText: {
    color: colors.primary[50]!,
  },
  footerLink: {
    color: colors.white,
    textDecorationLine: 'underline',
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface.elevated,
    borderRadius: 20,
    padding: theme.spacing[5],
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    paddingVertical: theme.spacing[1],
    marginBottom: theme.spacing[3],
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    marginVertical: theme.spacing[4],
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.DEFAULT,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    height: 52,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.black,
    marginTop: theme.spacing[3],
  },
  appleButtonText: {
    color: colors.white,
  },
});
