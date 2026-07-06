/** @format */

import type { ComponentType, SVGProps } from 'react';
import {
	EyeIcon,
	ShoppingCartIcon,
	DocumentTextIcon,
	ArrowsRightLeftIcon,
	BoltIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export interface TopProduct {
	id: string;
	title: string;
	views: number;
	favorites: number;
	imageUrl?: string;
	price: number;
	status: string;
}

export interface DailyPoint {
	date: string;
	views: number;
	favorites: number;
}

export type ActivityType = 'view' | 'favorite' | 'sale' | 'message' | 'trade_offer';

export interface Activity {
	type: ActivityType;
	productTitle: string;
	timestamp: string;
	amount?: number;
	userDisplayName?: string;
}

export interface CategoryStat {
	name: string;
	listings: number;
	views: number;
	sales: number;
}

export interface AnalyticsData {
	totalViews: number;
	totalFavorites: number;
	totalSales: number;
	totalRevenue: number;
	activeListings: number;
	pendingOrders: number;
	viewsChange: number;
	favoritesChange: number;
	salesChange: number;
	revenueChange: number;
	avgViewsPerListing: number;
	conversionRate: number;
	avgTimeToSell: number;
	repeatCustomerRate: number;
	topProducts: TopProduct[];
	dailyViews: DailyPoint[];
	recentActivity: Activity[];
	categoryStats: CategoryStat[];
}

/** Coerce every field to a safe default (backend may omit any of them). */
export function normalizeAnalytics(data: any): AnalyticsData {
	return {
		totalViews: data.totalViews || 0,
		totalFavorites: data.totalFavorites || 0,
		totalSales: data.totalSales || 0,
		totalRevenue: data.totalRevenue || 0,
		activeListings: data.activeListings || 0,
		pendingOrders: data.pendingOrders || 0,
		viewsChange: data.viewsChange || 0,
		favoritesChange: data.favoritesChange || 0,
		salesChange: data.salesChange || 0,
		revenueChange: data.revenueChange || 0,
		avgViewsPerListing: data.avgViewsPerListing || 0,
		conversionRate: data.conversionRate || 0,
		avgTimeToSell: data.avgTimeToSell || 0,
		repeatCustomerRate: data.repeatCustomerRate || 0,
		topProducts: data.topProducts || [],
		dailyViews: data.dailyViews || [],
		recentActivity: data.recentActivity || [],
		categoryStats: data.categoryStats || [],
	};
}

/** Empty analytics with a zeroed daily series sized to the period. */
export function emptyAnalytics(period: AnalyticsPeriod): AnalyticsData {
	const daysInPeriod = period === '7d' ? 7 : 14;
	const dailyViews: DailyPoint[] = Array.from({ length: daysInPeriod }, (_, i) => {
		const date = new Date();
		date.setDate(date.getDate() - (daysInPeriod - 1 - i));
		return { date: date.toISOString().split('T')[0], views: 0, favorites: 0 };
	});
	return {
		...normalizeAnalytics({}),
		dailyViews,
	};
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const ACTIVITY_CONFIG: Record<ActivityType, { icon: Icon; color: string; text: string }> = {
	view: { icon: EyeIcon, color: 'bg-info-100 text-info-600', text: 'görüntülendi' },
	favorite: { icon: HeartSolidIcon, color: 'bg-danger-100 text-danger-600', text: 'favorilere eklendi' },
	sale: { icon: ShoppingCartIcon, color: 'bg-success-100 text-success-600', text: 'satıldı' },
	message: { icon: DocumentTextIcon, color: 'bg-primary-100 text-primary-600', text: 'hakkında mesaj geldi' },
	trade_offer: { icon: ArrowsRightLeftIcon, color: 'bg-primary-100 text-primary-600', text: 'için takas teklifi geldi' },
};

export const FALLBACK_ACTIVITY = { icon: BoltIcon, color: 'bg-surface-alt text-muted', text: '' };

export function formatTimeAgo(timestamp: string): string {
	const diff = Date.now() - new Date(timestamp).getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (minutes < 60) return `${minutes} dk önce`;
	if (hours < 24) return `${hours} saat önce`;
	return `${days} gün önce`;
}

export const PERIOD_TABS: { value: AnalyticsPeriod; label: string }[] = [
	{ value: '7d', label: '7 Gün' },
	{ value: '30d', label: '30 Gün' },
	{ value: '90d', label: '90 Gün' },
];
