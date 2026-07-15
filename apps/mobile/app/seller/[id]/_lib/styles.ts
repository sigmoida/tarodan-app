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
    marginTop: theme.spacing[4],
    color: colors.text.muted,
  },
  content: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: colors.surface.DEFAULT,
    padding: theme.spacing[6],
    alignItems: 'center',
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[4],
    gap: theme.spacing[2],
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[2],
    gap: theme.spacing[1],
  },
  locationText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  memberSince: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: theme.spacing[6],
    paddingVertical: theme.spacing[4],
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
    marginTop: theme.spacing[1],
  },
  ratingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.warning[50]!,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.radius['3xl'],
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[4],
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
    marginTop: theme.spacing[4],
    gap: theme.spacing[2],
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.radius['3xl'],
    gap: theme.spacing[1],
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  responseInfo: {
    flexDirection: 'row',
    marginTop: theme.spacing[4],
    gap: theme.spacing[6],
  },
  responseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1.5],
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
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[5],
  },
  messageButton: {
    marginTop: theme.spacing[5],
    width: '100%',
    borderRadius: 12,
  },
  loginNotice: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[2],
    fontStyle: 'italic',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface.DEFAULT,
    marginTop: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[1],
    gap: theme.spacing[1],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary[600]!,
  },
  tabText: {
    fontSize: 12,
    textAlign: 'center',
    color: colors.text.muted,
  },
  tabTextActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  listingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.spacing[4],
    gap: theme.spacing[4],
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
    padding: theme.spacing[1.5],
    borderRadius: 12,
  },
  productContent: {
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[2.5],
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
    marginBottom: theme.spacing[1],
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  reviewsList: {
    padding: theme.spacing[4],
  },
  reviewCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  reviewHeader: {
    flexDirection: 'row',
    marginBottom: theme.spacing[3],
  },
  reviewInfo: {
    flex: 1,
    marginLeft: theme.spacing[3],
  },
  reviewerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ratingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[1],
    gap: theme.spacing[0.5],
  },
  reviewDate: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: theme.spacing[2],
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.heading,
  },
});
