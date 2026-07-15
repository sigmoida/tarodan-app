import { StyleSheet, Dimensions } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;
const { width } = Dimensions.get('window');

// Koleksiyon detay ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    color: colors.text.muted,
  },
  coverImage: {
    width,
    height: 200,
  },
  headerButtons: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlay.black50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  content: {
    flex: 1,
  },
  infoSection: {
    padding: theme.spacing[4],
  },
  collectionName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: theme.spacing[4],
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    padding: theme.spacing[3],
    borderRadius: 12,
    marginBottom: theme.spacing[4],
  },
  ownerInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ownerSince: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[1],
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50]!,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  valueInfo: {
    marginLeft: theme.spacing[3],
  },
  valueLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  valueAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.heading,
    marginBottom: theme.spacing[4],
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: theme.spacing[4],
  },
  itemsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  itemsCount: {
    fontSize: 14,
    color: colors.text.muted,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary[600]!,
  },
  addItemBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[600]!,
  },
  itemsGrid: {
    gap: theme.spacing[3],
  },
  itemsEmpty: {
    alignItems: 'center',
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[2],
  },
  itemsEmptyText: {
    color: colors.text.muted,
    fontSize: 14,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    overflow: 'hidden',
  },
  itemImage: {
    width: 100,
    height: 100,
  },
  itemInfo: {
    flex: 1,
    padding: theme.spacing[3],
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: theme.spacing[1],
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.muted,
  },
  itemYear: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  itemValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
    marginTop: theme.spacing[1],
  },
  itemNotes: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
    fontStyle: 'italic',
  },
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: colors.gray[50],
    margin: theme.spacing[4],
    borderRadius: 12,
    padding: theme.spacing[4],
  },
  noticeContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  noticeText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
    lineHeight: 18,
  },
  noticeButton: {
    marginTop: theme.spacing[3],
  },
});
