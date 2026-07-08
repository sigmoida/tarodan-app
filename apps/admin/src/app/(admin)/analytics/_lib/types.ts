import {
  CurrencyDollarIcon,
  UsersIcon,
  ShoppingBagIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

export type DateRange = '7d' | '30d' | '90d' | '1y';

export interface AnalyticsData {
  salesReport: any;
  userReport: any;
  productReport: any;
  tradeReport: any;
}

export const DATE_RANGE_OPTIONS = [
  { value: '7d', label: '7 Gün' },
  { value: '30d', label: '30 Gün' },
  { value: '90d', label: '90 Gün' },
  { value: '1y', label: '1 Yıl' },
];

export const ANALYTICS_TABS = [
  { key: 'sales', label: 'Satış Analitiği', icon: CurrencyDollarIcon },
  { key: 'users', label: 'Kullanıcı Analitiği', icon: UsersIcon },
  { key: 'products', label: 'Ürün Analitiği', icon: ShoppingBagIcon },
  { key: 'trades', label: 'Takas Analitiği', icon: ArrowsRightLeftIcon },
];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Ödeme Bekliyor',
  paid: 'Ödendi',
  preparing: 'Hazırlanıyor',
  shipped: 'Kargoda',
  delivered: 'Teslim Edildi',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  refund_requested: 'İade Talebi',
  refunded: 'İade Edildi',
};

export function getDateRangeParams(dateRange: DateRange) {
  const endDate = new Date();
  const startDate = new Date();
  switch (dateRange) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}
