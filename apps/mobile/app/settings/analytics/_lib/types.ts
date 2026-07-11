export interface Analytics {
  totalViews: number;
  totalFavorites: number;
  activeListings: number;
  totalSales: number;
  totalRevenue: number;
  dailyViews: Array<{ date: string; views: number; favorites: number }>;
  topProducts: Array<{
    id: string;
    title: string;
    views: number;
    favorites: number;
    price?: number;
    status?: string;
    imageUrl?: string;
  }>;
  // Premium analytics
  conversionRate?: number;
  avgTimeToSell?: number;
}

export const getDayLabels = () => {
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const today = new Date().getDay();
  const result = [];
  for (let i = 6; i >= 0; i--) {
    result.push(days[(today - i + 7) % 7]);
  }
  return result;
};

export const getMaxValue = (arr: number[]) => Math.max(...arr, 1);
