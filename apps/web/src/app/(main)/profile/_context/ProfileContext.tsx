/** @format */

'use client';

import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { useAuthStore } from '@/stores/authStore';
import {
	api,
	userApi,
	tradesApi,
	collectionsApi,
	wishlistApi,
	messagesApi,
} from '@/lib/api';
import { getTierDefault } from '../_lib/tiers';
import type { PendingCounts, UserProfile } from '../_lib/types';

interface ProfileOverview {
	profile: UserProfile;
	pendingCounts: PendingCounts;
}

/** Map the client authStore user into a UserProfile for instant first paint. */
function mapAuthUserToProfile(user: any): UserProfile {
	const tierType = user.membershipTier || 'free';
	return {
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		phone: user.phone,
		avatarUrl: user.avatarUrl,
		bio: user.bio,
		isVerified: user.isVerified,
		isSeller: user.isSeller,
		createdAt: String(user.createdAt),
		membershipTier: tierType,
		membership: {
			tier: getTierDefault(tierType),
			status: 'active',
			expiresAt: null,
		},
		stats: {
			productsCount: user.listingCount || 0,
			ordersCount: user.totalPurchases || 0,
			tradesCount: 0,
			collectionsCount: 0,
			rating: user.rating || 0,
			reviewsCount: user.totalRatings || 0,
		},
	};
}

function useProfileValue() {
	const router = useRouter();
	const {
		isAuthenticated,
		isLoading: authLoading,
		user,
		logout,
		refreshUserData,
	} = useAuthStore();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// Redirect unauthenticated visitors to login.
	useEffect(() => {
		if (mounted && !authLoading && !isAuthenticated) {
			router.push('/login?redirect=/profile');
		}
	}, [mounted, authLoading, isAuthenticated, router]);

	const enabled = mounted && !authLoading && !!isAuthenticated;

	const wishlistQuery = useQuery({
		queryKey: ['wishlist'],
		queryFn: async () => {
			const res = await wishlistApi.get();
			const data = res.data;
			const items = data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
			return Array.isArray(items) ? items : [];
		},
		enabled,
		meta: { page: 'profile-wishlist-count' },
	});

	const unreadMessagesQuery = useQuery({
		queryKey: queryKeys.profile.unreadMessages(),
		queryFn: async () => {
			const res = await messagesApi.getThreads();
			const threads = res.data?.data || res.data?.threads || [];
			return (Array.isArray(threads) ? threads : []).reduce(
				(sum: number, thread: any) => sum + (thread.unreadCount || 0),
				0,
			);
		},
		enabled,
		meta: { page: 'profile-unread-messages' },
	});

	// The profile overview aggregate — one query for the 8 upstream calls, with
	// window-focus/mount refetch (replaces the old manual effects). The authStore
	// user seeds `placeholderData` so the header renders instantly.
	const overviewQuery = useQuery<ProfileOverview>({
		queryKey: queryKeys.profile.overview(),
		enabled,
		refetchOnWindowFocus: true,
		placeholderData: user
			? { profile: mapAuthUserToProfile(user), pendingCounts: { offers: 0, trades: 0 } }
			: undefined,
		queryFn: async () => {
			const [
				profileResponse,
				statsResponse,
				ordersResponse,
				productsResponse,
				tradesResponse,
				collectionsResponse,
				offersPendingResponse,
				tradesPendingResponse,
			] = await Promise.all([
				userApi.getProfile().catch(() => null),
				userApi.getStats().catch(() => null),
				api.get('/orders', { params: { limit: 1 } }).catch(() => null),
				userApi.getMyProducts({ limit: 100 }).catch(() => null),
				tradesApi.getAll({ limit: 1 }).catch(() => null),
				collectionsApi.getMyCollections({ limit: 1 }).catch(() => null),
				api.get('/offers/pending-count').catch(() => null),
				api.get('/trades/pending-count').catch(() => null),
			]);

			const pendingCounts: PendingCounts = {
				offers: offersPendingResponse?.data?.received || 0,
				trades: tradesPendingResponse?.data?.received || 0,
			};

			const profileData =
				profileResponse?.data?.user || profileResponse?.data || user;
			const statsData = statsResponse?.data?.data || statsResponse?.data || {};
			const ordersCount =
				ordersResponse?.data?.meta?.total ||
				ordersResponse?.data?.data?.length ||
				0;

			// Count active products (exclude deleted/inactive).
			let productsCount = 0;
			if (productsResponse?.data) {
				const products =
					productsResponse.data?.data || productsResponse.data?.products || [];
				productsCount = products.filter(
					(p: any) => p.status !== 'deleted' && p.status !== 'inactive',
				).length;
			} else {
				productsCount = productsResponse?.data?.meta?.total || 0;
			}
			const tradesCount =
				tradesResponse?.data?.meta?.total ||
				tradesResponse?.data?.data?.length ||
				tradesResponse?.data?.trades?.length ||
				0;
			const collectionsCount =
				collectionsResponse?.data?.meta?.total ||
				collectionsResponse?.data?.data?.length ||
				collectionsResponse?.data?.collections?.length ||
				0;

			const base = profileData || user;
			const membershipFromApi = base?.membership;
			const tierType =
				membershipFromApi?.tier?.type ||
				base?.membershipTier ||
				user?.membershipTier ||
				'free';
			const tierInfo = membershipFromApi?.tier || getTierDefault(tierType);

			const profile: UserProfile = {
				...base,
				displayName:
					base?.displayName || base?.display_name || user?.displayName || '',
				isVerified:
					base?.isVerified || base?.is_verified || user?.isVerified || false,
				isSeller: base?.isSeller || base?.is_seller || user?.isSeller || false,
				createdAt:
					base?.createdAt ||
					base?.created_at ||
					user?.createdAt ||
					new Date().toISOString(),
				membershipTier: tierType,
				membership: {
					tier: tierInfo,
					status: membershipFromApi?.status || 'active',
					expiresAt: membershipFromApi?.expiresAt || null,
				},
				stats: {
					productsCount:
						productsCount || base?.listingCount || (statsData.productsCount ?? 0),
					ordersCount: ordersCount || (statsData.ordersCount ?? 0),
					tradesCount: tradesCount || (statsData.tradesCount ?? 0),
					collectionsCount: collectionsCount || (statsData.collectionsCount ?? 0),
					rating: statsData.rating ?? base?.rating ?? user?.rating ?? 0,
					reviewsCount:
						statsData.reviewsCount ??
						statsData.totalRatings ??
						user?.totalRatings ??
						0,
					followersCount: statsData.followersCount ?? base?.followersCount ?? 0,
				},
			};

			// Keep the auth store in sync (fire-and-forget, as before).
			refreshUserData();

			return { profile, pendingCounts };
		},
	});

	const handleLogout = () => {
		logout();
		router.push('/');
	};

	return {
		mounted,
		authLoading,
		isAuthenticated,
		profile: overviewQuery.data?.profile ?? null,
		pendingCounts: overviewQuery.data?.pendingCounts ?? { offers: 0, trades: 0 },
		isLoadingProfile: overviewQuery.isLoading && !overviewQuery.data,
		wishlistCount: wishlistQuery.data?.length ?? 0,
		unreadMessagesCount: unreadMessagesQuery.data ?? 0,
		handleLogout,
	};
}

type ProfileValue = ReturnType<typeof useProfileValue>;

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
	const value = useProfileValue();
	return (
		<ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
	);
}

export function useProfile() {
	const ctx = useContext(ProfileContext);
	if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
	return ctx;
}
