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
    marginTop: 16,
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
    gap: 12,
  },
  content: {
    flex: 1,
  },
  infoSection: {
    padding: 16,
  },
  collectionName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  ownerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ownerSince: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
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
    padding: 16,
    marginBottom: 16,
  },
  valueInfo: {
    marginLeft: 12,
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
    marginBottom: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
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
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
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
    gap: 12,
  },
  itemsEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
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
    padding: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.muted,
  },
  itemYear: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  itemValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
    marginTop: 4,
  },
  itemNotes: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: colors.gray[50],
    margin: 16,
    borderRadius: 12,
    padding: 16,
  },
  noticeContent: {
    flex: 1,
    marginLeft: 12,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  noticeText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  noticeButton: {
    marginTop: 12,
  },
});
