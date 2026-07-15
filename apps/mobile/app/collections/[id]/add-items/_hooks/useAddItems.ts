import { useState, useMemo, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi, collectionsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { OPTIMISTIC, type Listing } from '../_lib/types';

/**
 * Add-collection-items controller — owns the user-listings query, the collection
 * picker map query, and the optimistic add/remove toggle (overlay layer +
 * in-flight guard so concurrent toggles don't clobber each other). Lifted
 * VERBATIM from the monolithic screen — the optimistic race logic is delicate (§12).
 */
export function useAddItems() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collectionId = String(id);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  // o an POST/DELETE bekleyen productId'ler (satır spinner'ı + tekrar-tıklama kilidi)
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // Sunucu haritasının ÜZERİNE binen yerel katman: itemId (eklendi) | null (çıkarıldı).
  const [overlay, setOverlay] = useState<Record<string, string | null>>({});
  // Uçuştaki mutasyon sayısı: picker refetch'i ancak hepsi bittiğinde yapılır.
  const inFlight = useRef(0);

  // Kullanıcının kendi ilanları — yalnız active/sold (backend görünür item filtresiyle birebir).
  const { data: listings = [], isLoading: listingsLoading } = useQuery<Listing[]>({
    queryKey: ['my-listings', 'all'],
    queryFn: async () => {
      const res = await productsApi.getMyListings({ limit: 100 });
      const all: Listing[] = res.data?.data || res.data || [];
      return all.filter((l) => l.status === 'active' || l.status === 'sold');
    },
  });

  // Koleksiyondaki ürünler → productId -> collectionItemId haritası (tek gerçek kaynak sunucu).
  const { data: serverMap = {}, isLoading: collectionLoading } = useQuery<Record<string, string>>({
    queryKey: ['collection-picker', collectionId],
    staleTime: 0,
    queryFn: async () => {
      const res = await collectionsApi.getOne(collectionId);
      const data = res.data?.data || res.data;
      const map: Record<string, string> = {};
      for (const it of data?.items || []) {
        if (it.productId) map[it.productId] = it.id;
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => l.title?.toLowerCase().includes(q));
  }, [listings, search]);

  const effectiveItemId = (productId: string): string | undefined => {
    if (productId in overlay) return overlay[productId] ?? undefined;
    return serverMap[productId];
  };

  const patchOverlay = (productId: string, itemId: string | null) => {
    setOverlay((o) => ({ ...o, [productId]: itemId }));
  };

  const toggle = async (listing: Listing) => {
    if (pending[listing.id]) return;
    const itemId = effectiveItemId(listing.id);
    // Gerçek itemId henüz gelmediyse çıkarma isteği atılamaz; senkron tamamlanana dek bekle.
    if (itemId === OPTIMISTIC) return;
    const adding = !itemId;
    setPending((p) => ({ ...p, [listing.id]: true }));
    inFlight.current += 1;
    // Optimistic: anında işaretle/kaldır. Sunucu cevabı gerçeğe oturtur.
    patchOverlay(listing.id, adding ? OPTIMISTIC : null);

    try {
      if (!adding) {
        await collectionsApi.removeItem(collectionId, itemId!);
        setSnackbar({ visible: true, message: 'Koleksiyondan çıkarıldı' });
      } else {
        try {
          const res = await collectionsApi.addItem(collectionId, { productId: listing.id });
          const newItem = res.data?.data || res.data;
          if (newItem?.id) patchOverlay(listing.id, newItem.id);
          setSnackbar({ visible: true, message: 'Koleksiyona eklendi' });
        } catch (e: any) {
          const msg = e?.response?.data?.message || '';
          // Yarış/eskimiş durum: ürün zaten ekliyse hata gösterme, ekli kabul et.
          if (e?.response?.status === 400 && /zaten/i.test(msg)) {
            setSnackbar({ visible: true, message: 'Bu ürün zaten koleksiyonda' });
          } else {
            throw e;
          }
        }
      }
      // Detay/liste ekranlarını tazele (sahip olduğu için viewCount artmaz).
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: qk.collections.mine });
    } catch (e: any) {
      // Başarısız mutasyonu geri al: katmandan düş, sunucu haritası geçerli olsun.
      setOverlay((o) => {
        const next = { ...o };
        delete next[listing.id];
        return next;
      });
      setSnackbar({ visible: true, message: e?.response?.data?.message || 'İşlem başarısız' });
    } finally {
      inFlight.current -= 1;
      setPending((p) => ({ ...p, [listing.id]: false }));
      // Picker'ı yalnızca uçuşta başka işlem KALMADIYSA sunucudan doğrula.
      if (inFlight.current === 0) {
        await queryClient.invalidateQueries({ queryKey: ['collection-picker', collectionId] });
        // Refetch beklenirken yeni işlem başladıysa katmana dokunma.
        if (inFlight.current === 0) setOverlay({});
      }
    }
  };

  return {
    search,
    setSearch,
    snackbar,
    setSnackbar,
    pending,
    listings,
    filtered,
    isLoading: listingsLoading || collectionLoading,
    effectiveItemId,
    toggle,
  };
}

export type AddItemsController = ReturnType<typeof useAddItems>;
