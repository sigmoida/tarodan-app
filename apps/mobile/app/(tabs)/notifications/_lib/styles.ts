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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    gap: 8,
  },
  backBtn: {
    marginLeft: -4,
    marginRight: 2,
    padding: 2,
  },
  titleSpacing: { marginBottom: 4 },
  messageSpacing: { marginBottom: 6 },
  list: {
    padding: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.white,
    padding: 14,
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
    marginRight: 12,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: theme.colors.gray[50],
  },
  content: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary[500],
    marginLeft: 8,
    marginTop: 6,
  },
});
