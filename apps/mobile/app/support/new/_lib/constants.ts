import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// id'ler backend TicketCategory enum'u ile birebir (payment, shipping, trade, account, product, technical, other)
export const SUPPORT_CATEGORIES = [
  { id: 'shipping', name: 'Sipariş/Kargo Sorunu', icon: 'cube-outline' },
  { id: 'payment', name: 'Ödeme Sorunu', icon: 'card-outline' },
  { id: 'account', name: 'Hesap Sorunu', icon: 'person-outline' },
  { id: 'product', name: 'İlan Sorunu', icon: 'pricetag-outline' },
  { id: 'trade', name: 'Takas Sorunu', icon: 'swap-horizontal' },
  { id: 'other', name: 'Diğer', icon: 'ellipsis-horizontal' },
];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PRIORITY_OPTIONS = [
  { id: 'low', name: 'Düşük', color: colors.success[600]! },
  { id: 'medium', name: 'Orta', color: colors.warning[600]! },
  { id: 'high', name: 'Yüksek', color: colors.danger[600]! },
];
