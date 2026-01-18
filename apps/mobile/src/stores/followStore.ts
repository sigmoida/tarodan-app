import { create } from 'zustand';
import { api } from '../services/api';

interface FollowedSeller {
  id: string;
  displayName: string;
  avatarUrl?: string;
  listingCount: number;
  rating?: number;
  followedAt: string;
}

interface FollowState {
  following: FollowedSeller[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchFollowing: () => Promise<void>;
  followSeller: (sellerId: string) => Promise<boolean>;
  unfollowSeller: (sellerId: string) => Promise<boolean>;
  
  // Helpers
  isFollowing: (sellerId: string) => boolean;
  getFollowingCount: () => number;
}

export const useFollowStore = create<FollowState>((set, get) => ({
  following: [],
  isLoading: false,
  error: null,

  fetchFollowing: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/users/me/following');
      const data = response.data?.data || response.data || [];
      set({ following: Array.isArray(data) ? data : [], isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch following:', error);
      set({ error: 'Takip listesi yüklenemedi', isLoading: false, following: [] });
    }
  },

  followSeller: async (sellerId: string) => {
    try {
      const response = await api.post(`/users/${sellerId}/follow`);
      
      // Add to local state
      const newFollowing: FollowedSeller = response.data?.user || {
        id: sellerId,
        displayName: 'Satıcı',
        listingCount: 0,
        followedAt: new Date().toISOString(),
      };
      
      set(state => ({
        following: [...state.following, newFollowing],
      }));
      
      return true;
    } catch (error: any) {
      console.error('Failed to follow:', error);
      
      // If already following, return success
      if (error.response?.status === 409) {
        return true;
      }
      
      set({ error: 'Takip edilemedi' });
      return false;
    }
  },

  unfollowSeller: async (sellerId: string) => {
    try {
      await api.delete(`/users/${sellerId}/follow`);
      
      // Remove from local state
      set(state => ({
        following: state.following.filter(f => f.id !== sellerId),
      }));
      
      return true;
    } catch (error: any) {
      console.error('Failed to unfollow:', error);
      
      // If not following, return success
      if (error.response?.status === 404) {
        set(state => ({
          following: state.following.filter(f => f.id !== sellerId),
        }));
        return true;
      }
      
      set({ error: 'Takipten çıkarılamadı' });
      return false;
    }
  },

  isFollowing: (sellerId: string) => {
    return get().following.some(f => f.id === sellerId);
  },

  getFollowingCount: () => {
    return get().following.length;
  },
}));

export default useFollowStore;
