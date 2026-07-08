'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '@/lib/query/keys';
import {
  flattenCategories,
  fetchPublicCollectionsClient,
  fetchMyCollectionsClient,
  fetchCategoriesClient,
  type Collection,
  type SortOption,
} from '../_lib/data';

interface CollectionsContextValue {
  mounted: boolean;
  isAuthenticated: boolean;
  limits: ReturnType<typeof useAuthStore.getState>['limits'];
  activeTab: 'public' | 'mine';
  setActiveTab: (tab: 'public' | 'mine') => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  sortBy: SortOption;
  setSortBy: (value: SortOption) => void;
  categoryId: string;
  setCategoryFilter: (id: string) => void;
  categoryParamId: string;
  flatCategories: { id: string; name: string; slug: string }[];
  myCollections: Collection[];
  displayedCollections: Collection[];
  publicTotal: number;
  loading: boolean;
  showCreateModal: boolean;
  setShowCreateModal: (open: boolean) => void;
  showPremiumModal: boolean;
  setShowPremiumModal: (open: boolean) => void;
  handleCreateClick: () => void;
  handleCreated: (collectionId?: string) => void;
}

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

function useCollectionsValue(): CollectionsContextValue {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, limits } = useAuthStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [activeTab, setActiveTab] = useState<'public' | 'mine'>('public');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  // Init synchronously from the URL so the first-render query key matches the
  // server seed (no refetch flash).
  const [categoryId, setCategoryId] = useState(() => searchParams.get('categoryId') || '');

  useEffect(() => {
    setCategoryId(searchParams.get('categoryId') || '');
  }, [searchParams, mounted]);

  const setCategoryFilter = (id: string) => {
    setCategoryId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('categoryId', id);
    else params.delete('categoryId');
    const q = params.toString();
    router.replace(q ? `?${q}` : '/collections', { scroll: false });
  };

  const { data: categoriesTree } = useQuery({
    queryKey: queryKeys.categories.collections(),
    queryFn: fetchCategoriesClient,
    meta: { page: 'collections-categories' },
  });
  const flatCategories = useMemo(
    () => (Array.isArray(categoriesTree) ? flattenCategories(categoriesTree) : []),
    [categoriesTree],
  );

  const categoryParamId = typeof categoryId === 'string' ? categoryId.trim() : '';
  // page/pageSize göndermiyoruz; API varsayılanı (ilk sayfa, 20 kayıt) kullanılsın. Gönderince sadece 1 sonuç dönme hatası oluşuyordu.
  const publicQuery = useQuery({
    queryKey: queryKeys.collections.public(sortBy, searchQuery.trim(), categoryParamId),
    queryFn: () => fetchPublicCollectionsClient(sortBy, searchQuery.trim(), categoryParamId),
    placeholderData: keepPreviousData,
    meta: { page: 'collections-public' },
  });
  const publicData = publicQuery.data;
  const collections = publicData?.collections ?? [];
  const publicTotal = publicData?.total ?? 0;

  const myQuery = useQuery({
    queryKey: queryKeys.collections.mine(),
    queryFn: fetchMyCollectionsClient,
    enabled: isAuthenticated,
    meta: { page: 'collections-mine' },
  });
  const myCollections = myQuery.data ?? [];

  const loading = activeTab === 'public'
    ? (publicQuery.isLoading && !publicQuery.data)
    : (myQuery.isLoading && !myQuery.data);

  const canCreateCollection = user?.membershipTier !== 'free' || limits?.canCreateCollections;

  const handleCreateClick = () => {
    if (!canCreateCollection) {
      setShowPremiumModal(true);
      return;
    }
    setShowCreateModal(true);
  };

  const handleCreated = (collectionId?: string) => {
    setShowCreateModal(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.collections.mine() });
    if (collectionId) router.push(`/collections/${collectionId}`);
  };

  const filteredAndSortedCollections = useMemo(() => {
    let result = activeTab === 'public' ? collections : myCollections;

    if (activeTab === 'mine' && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (collection) =>
          collection.name.toLowerCase().includes(query) ||
          collection.description?.toLowerCase().includes(query) ||
          collection.userName?.toLowerCase().includes(query)
      );
    }

    if (activeTab === 'mine') {
      const sorted = [...result];
      switch (sortBy) {
        case 'popular':
          sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
          break;
        case 'recent':
          sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
        case 'name':
          const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: false });
          sorted.sort((a, b) => collator.compare(a.name.toLowerCase(), b.name.toLowerCase()));
          break;
        case 'items_asc':
          sorted.sort((a, b) => (a.itemCount || 0) - (b.itemCount || 0));
          break;
        case 'items_desc':
          sorted.sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));
          break;
      }
      return sorted;
    }

    return result;
  }, [activeTab, collections, myCollections, searchQuery, sortBy]);

  const displayedCollections = filteredAndSortedCollections;

  return {
    mounted,
    isAuthenticated,
    limits,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    categoryId,
    setCategoryFilter,
    categoryParamId,
    flatCategories,
    myCollections,
    displayedCollections,
    publicTotal,
    loading,
    showCreateModal,
    setShowCreateModal,
    showPremiumModal,
    setShowPremiumModal,
    handleCreateClick,
    handleCreated,
  };
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
  const value = useCollectionsValue();
  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

export function useCollections(): CollectionsContextValue {
  const ctx = useContext(CollectionsContext);
  if (!ctx) {
    throw new Error('useCollections must be used within a CollectionsProvider');
  }
  return ctx;
}
