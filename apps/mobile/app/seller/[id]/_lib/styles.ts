import { StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

import { CARD_WIDTH } from './constants';

const { colors } = theme;

// Satıcı profil ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
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
  content: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: colors.surface.DEFAULT,
    padding: 24,
    alignItems: 'center',
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  memberSince: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border.DEFAULT,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border.DEFAULT,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  statLabel: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  ratingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.warning[50]!,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginTop: 16,
  },
  trustBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning[700]!,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  responseInfo: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 24,
  },
  responseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  responseText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  bio: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.heading,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  messageButton: {
    marginTop: 20,
    width: '100%',
    borderRadius: 12,
  },
  loginNotice: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface.DEFAULT,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary[600]!,
  },
  tabText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  tabTextActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  listingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  productCard: {
    width: CARD_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface.DEFAULT,
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.success[500]!,
    padding: 6,
    borderRadius: 12,
  },
  productContent: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  reviewsList: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  reviewInfo: {
    flex: 1,
    marginLeft: 12,
  },
  reviewerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ratingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: 8,
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.heading,
  },
});
