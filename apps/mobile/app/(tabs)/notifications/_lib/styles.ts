import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Route-local stylesheet (§12). Monolitten BİREBİR taşındı.
export const styles = StyleSheet.create({
  // SafeAreaView'in kendisi turuncu → status bar inset'i de turuncu olur
  // (anasayfa/profil header'larıyla aynı). İçerik gri arka planı `body`'den alır.
  container: {
    flex: 1,
    backgroundColor: colors.primary[600],
  },
  body: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  header: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary[600],
  },
  // Turuncu header üstünde okunması için beyaz rozet (home/profil deseni).
  headerBadge: {
    backgroundColor: colors.white,
  },
  markAllText: {
    color: colors.white,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  backBtn: {
    marginLeft: -4,
    marginRight: theme.spacing[0.5],
    padding: theme.spacing[0.5],
  },
  titleSpacing: { marginBottom: theme.spacing[1] },
  messageSpacing: { marginBottom: theme.spacing[1.5] },
  list: {
    padding: theme.spacing[4],
  },
  emptyList: {
    flexGrow: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.white,
    padding: theme.spacing[3.5],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.DEFAULT,
  },
  itemUnread: {
    backgroundColor: theme.colors.primary[50],
    borderColor: theme.colors.primary[500],
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing[3],
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    marginRight: theme.spacing[3],
    backgroundColor: theme.colors.gray[50],
  },
  content: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    marginLeft: theme.spacing[2],
    marginTop: theme.spacing[1.5],
  },
});
