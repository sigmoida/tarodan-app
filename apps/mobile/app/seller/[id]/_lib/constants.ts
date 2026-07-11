import { Dimensions } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

const { width } = Dimensions.get('window');
export const CARD_WIDTH = (width - 48) / 2;

export const BADGE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  fast_shipper: { label: 'Hızlı Kargo', icon: 'rocket-outline', color: colors.info[600]! },
  trusted_seller: { label: 'Güvenilir', icon: 'shield-checkmark', color: colors.success[600]! },
  responsive: { label: 'Hızlı Yanıt', icon: 'chatbubble-outline', color: colors.info[600]! },
  elite_collector: { label: 'Elit Koleksiyoner', icon: 'diamond-outline', color: colors.warning[500]! },
  hall_of_fame: { label: 'Onur Listesi', icon: 'trophy-outline', color: colors.warning[500]! },
};
