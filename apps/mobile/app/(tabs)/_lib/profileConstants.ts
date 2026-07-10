import type { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Rozet/hızlı-işlem renk tonları (design-token tabanlı).
export const benefitTints = [
  { bg: colors.success[50]!, fg: colors.success[600]! },
  { bg: colors.info[50]!, fg: colors.info[600]! },
  { bg: colors.danger[50]!, fg: colors.danger[600]! },
  { bg: colors.warning[50]!, fg: colors.warning[600]! },
] as const;

export const quickActionTint = { bg: colors.primary[50]!, fg: colors.primary[700]! } as const;

export interface ProfileCollection {
  id: string;
  name: string;
  coverImageUrl?: string;
  coverImage?: string;
  itemCount?: number;
  isPublic?: boolean;
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Kimliği doğrulanmış kullanıcı için "Hızlı Erişim" ızgarası.
export const quickActionItems: Array<{
  icon: IoniconName;
  label: string;
  to: string;
  testID?: string;
}> = [
  { icon: 'pricetag', label: 'İlanlarım', to: '/settings/my-listings' },
  { icon: 'cube', label: 'Siparişlerim', to: '/orders', testID: 'profile-orders-link' },
  { icon: 'cash', label: 'Satışlarım', to: '/sales', testID: 'profile-sales-link' },
  { icon: 'arrow-undo', label: 'İadelerim', to: '/refund-requests', testID: 'profile-refunds-link' },
  { icon: 'heart', label: 'Favorilerim', to: '/favorites' },
  { icon: 'chatbubbles', label: 'Mesajlar', to: '/messages' },
  { icon: 'albums', label: 'Beğenilen Koleksiyonlar', to: '/settings/liked-collections' },
  { icon: 'swap-horizontal', label: 'Takaslarım', to: '/trades', testID: 'profile-trades-link' },
  { icon: 'pricetags', label: 'Tekliflerim', to: '/offers', testID: 'profile-offers-link' },
  { icon: 'stats-chart', label: 'İstatistikler', to: '/settings/analytics' },
  { icon: 'help-circle', label: 'Yardım', to: '/help' },
];
