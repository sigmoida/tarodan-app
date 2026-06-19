"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";

// ─── Tipler ────────────────────────────────────────────────────────────────

export interface UseAdminResourceOptions<T> {
  /** react-query cache anahtarı — benzersiz kaynak adı, örn. "trades" */
  queryKey: string;
  /**
   * Veri çekme fonksiyonu. Params: { page, limit, search?, ...initialFilters anahtarları }
   * AdminApi metodlarının döndürdüğü Axios yanıtını bekliyoruz.
   */
  fetcher: (params: Record<string, any>) => Promise<AxiosResponse<any>>;
  /** Sayfa başına kayıt sayısı. Varsayılan: 20 */
  limit?: number;
  /**
   * true ise URL'e ?page=&q=&<filtre-anahtarları>= yansıtılır;
   * sayfa yüklenirken de URL'den okunur. Deep-link ve geri tuşu desteği sağlar.
   */
  syncUrl?: boolean;
  /** Başlangıç filtre değerleri (arama hariç). Örn. { status: "all", userId: "" } */
  initialFilters?: Record<string, string>;
  /** Hata durumunda toast mesajı. Varsayılan: "Veriler yüklenemedi" */
  errorMessage?: string;
  /**
   * Arama debounce süresi (ms). Varsayılan: 300.
   * 0 verilirse debounce olmaksızın anında çalışır.
   * setSearch çağrıldığında input ANINDA güncellenir; bu süre sonra query tetiklenir.
   * Enter (onSearchSubmit) hâlâ çalışır ve debounce'u atlayarak anında flush yapar.
   */
  debounceMs?: number;
}

export interface UseAdminResourceResult<T> {
  /** Geçerli sayfanın satırları */
  rows: T[];
  /** Toplam kayıt sayısı (backend meta'dan) */
  total: number;
  /** Geçerli sayfa numarası (1 tabanlı) */
  page: number;
  setPage: (p: number) => void;
  /** Toplam sayfa sayısı */
  totalPages: number;
  /** Arama kutusu değeri (kontrollü input için) */
  search: string;
  /**
   * Arama kutusunu günceller; input ANINDA güncellenir (takılmaz).
   * debounceMs sonra arama otomatik commit olur → query + page reset.
   * Boş değere dönünce de fetch tetiklenir.
   */
  setSearch: (v: string) => void;
  /** Enter/arama butonu: debounce'u atlayarak anında flush yapar ve sayfayı 1'e sıfırlar */
  onSearchSubmit: () => void;
  /** Filtre değerleri map'i */
  filters: Record<string, string>;
  /** Tek bir filtre anahtarını günceller ve sayfayı sıfırlar */
  setFilter: (key: string, value: string) => void;
  /** Veri yükleniyor (ilk yükleme veya refetch) */
  isLoading: boolean;
  /** react-query refetch'ini manuel tetikler */
  refetch: () => void;
}

// ─── Yardımcı: backend yanıtından data ve total çıkar ──────────────────────

function extractData<T>(
  responseData: any,
  queryKey: string,
): { rows: T[]; total: number } {
  // Olası payload yapıları (backend tutarsızlığına karşı savunmacı erişim):
  //   { data: [...], meta: { total } }         — getTrades, getOrders, getProducts
  //   { [queryKey]: [...], meta: { total } }   — { users: [...] }
  //   { data: { data: [...], meta } }          — iç içe sarmalanmış
  //   { items: [...], total }                  — bazı endpoint'ler
  //   { data: [], total, page, ... }           — top-level total (arama-boş dalı)
  const root = responseData ?? {};
  const nested = root.data;

  // rows: dizi olan ilk adayı seç (düz veya iç içe).
  const rows: T[] =
    [
      root.data,
      root[queryKey],
      root.items,
      nested?.data,
      nested?.[queryKey],
      nested?.items,
      Array.isArray(root) ? root : undefined,
    ].find(Array.isArray) ?? [];

  // total: meta.total → top-level total → iç içe total → fallback rows.length.
  // ÖNEMLİ: { data: [...], meta } yapısında meta, data dizisinin KARDEŞİdir;
  // bu yüzden meta'yı root'tan okuyoruz (payload'ı diziye indirgemeden). Aksi
  // halde total, rows.length'e (= sayfa boyutu) düşer ve çok sayfalı listelerde
  // toplam yanlış görünür.
  const meta = root.meta ?? nested?.meta ?? {};
  const total: number =
    meta.total ?? root.total ?? nested?.total ?? rows.length;

  return { rows, total };
}

// ─── Hook ──────────────────────────────────────────────────────────────────

/**
 * Admin liste sayfaları için ortak veri-durum yönetimi.
 * react-query üstünde fetch + pagination + arama + filtreler + URL senkronu.
 *
 * Kullanım:
 * ```ts
 * const { rows, total, page, setPage, totalPages, search, setSearch,
 *         onSearchSubmit, filters, setFilter, isLoading, refetch } =
 *   useAdminResource<Trade>({
 *     queryKey: "trades",
 *     fetcher: (params) => adminApi.getTrades(params),
 *     limit: 20,
 *     syncUrl: true,
 *     initialFilters: { status: "all" },
 *     debounceMs: 300, // varsayılan; smooth arama
 *   });
 * ```
 */
export function useAdminResource<T>({
  queryKey,
  fetcher,
  limit = 20,
  syncUrl = false,
  initialFilters = {},
  errorMessage = "Veriler yüklenemedi",
  debounceMs = 300,
}: UseAdminResourceOptions<T>): UseAdminResourceResult<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── URL'den ilk değerleri oku (syncUrl) ──────────────────────────────────
  const getInitialPage = () => {
    if (!syncUrl) return 1;
    const p = parseInt(searchParams.get("page") ?? "1", 10);
    return isNaN(p) || p < 1 ? 1 : p;
  };
  const getInitialSearch = () => {
    if (!syncUrl) return "";
    return searchParams.get("q") ?? "";
  };
  const getInitialFilters = () => {
    if (!syncUrl) return { ...initialFilters };
    const merged = { ...initialFilters };
    Object.keys(initialFilters).forEach((key) => {
      const urlVal = searchParams.get(key);
      if (urlVal !== null) merged[key] = urlVal;
    });
    return merged;
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const [page, setPageState] = useState<number>(getInitialPage);
  // inputSearch = input değeri (anlık, kontrollü)
  // committedSearch = debounce/Enter sonrası onaylanan; query buna göre çalışır
  const [inputSearch, setInputSearch] = useState<string>(getInitialSearch);
  const [committedSearch, setCommittedSearch] = useState<string>(getInitialSearch);
  const [filters, setFiltersState] = useState<Record<string, string>>(getInitialFilters);

  // debounce timer ref'i
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── URL senkronu (yaz) ────────────────────────────────────────────────────
  const syncToUrl = useCallback(
    (p: number, q: string, f: Record<string, string>) => {
      if (!syncUrl) return;
      const params = new URLSearchParams();
      if (p > 1) params.set("page", String(p));
      if (q) params.set("q", q);
      Object.entries(f).forEach(([key, val]) => {
        // initialFilters default değerini URL'e yazmıyoruz (temiz URL)
        if (val && val !== (initialFilters[key] ?? "")) params.set(key, val);
      });
      const qs = params.toString();
      const newUrl = qs ? `${pathname}?${qs}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [syncUrl, pathname, router, initialFilters],
  );

  // URL'den gelen dış değişiklikleri yakala (örn. kullanıcı geri tuşuna basınca)
  // Sadece syncUrl=true iken çalışır; diğerlerine dokunmaz.
  const lastUrlRef = useRef(searchParams.toString());
  useEffect(() => {
    if (!syncUrl) return;
    const current = searchParams.toString();
    if (current === lastUrlRef.current) return;
    lastUrlRef.current = current;

    const urlPage = parseInt(searchParams.get("page") ?? "1", 10);
    const urlQ = searchParams.get("q") ?? "";
    const newFilters = { ...initialFilters };
    Object.keys(initialFilters).forEach((key) => {
      const v = searchParams.get(key);
      if (v !== null) newFilters[key] = v;
    });

    setPageState(isNaN(urlPage) || urlPage < 1 ? 1 : urlPage);
    setInputSearch(urlQ);
    setCommittedSearch(urlQ);
    setFiltersState(newFilters);
  }, [searchParams, syncUrl, initialFilters]);

  // ── Yardımcı setter'lar ────────────────────────────────────────────────────
  const setPage = useCallback(
    (p: number) => {
      setPageState(p);
      syncToUrl(p, committedSearch, filters);
    },
    [committedSearch, filters, syncToUrl],
  );

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = { ...filters, [key]: value };
      setFiltersState(next);
      setPageState(1);
      syncToUrl(1, committedSearch, next);
    },
    [filters, committedSearch, syncToUrl],
  );

  // ── Debounce'lu arama: setSearch input'u anında günceller; debounce sonra commit ──
  const setSearch = useCallback(
    (value: string) => {
      // Input'u ANINDA güncelle (kontrollü input takılmasın)
      setInputSearch(value);

      // Önceki zamanlayıcıyı iptal et
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      if (debounceMs === 0) {
        // Debounce'suz: anında commit
        setCommittedSearch(value);
        setPageState(1);
        syncToUrl(1, value, filters);
      } else {
        // debounceMs sonra commit et
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          setCommittedSearch(value);
          setPageState(1);
          syncToUrl(1, value, filters);
        }, debounceMs);
      }
    },
    [debounceMs, filters, syncToUrl],
  );

  // ── onSearchSubmit: debounce'u atlayarak anında flush ─────────────────────
  const onSearchSubmit = useCallback(() => {
    // Bekleyen debounce'u iptal et
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // inputSearch'i anında commit et
    setCommittedSearch(inputSearch);
    setPageState(1);
    syncToUrl(1, inputSearch, filters);
  }, [inputSearch, filters, syncToUrl]);

  // Unmount'ta zamanlayıcıyı temizle
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── Query params (fetch için) ──────────────────────────────────────────────
  // "all" değerini backend'e gönderme — sadece gerçek filtre değerlerini geçir
  const buildParams = useCallback(() => {
    const params: Record<string, any> = { page, limit };
    if (committedSearch) params.search = committedSearch;
    Object.entries(filters).forEach(([key, val]) => {
      if (val && val !== "all") params[key] = val;
    });
    return params;
  }, [page, limit, committedSearch, filters]);

  // ── react-query ────────────────────────────────────────────────────────────
  const queryResult = useQuery({
    queryKey: [queryKey, page, committedSearch, filters],
    queryFn: async () => {
      const response = await fetcher(buildParams());
      return response.data;
    },
    placeholderData: keepPreviousData, // yazarken liste titremesin (smooth arama)
  });

  // Hata → toast (queryResult.error değişince)
  const lastErrorRef = useRef<unknown>(null);
  useEffect(() => {
    if (queryResult.error && queryResult.error !== lastErrorRef.current) {
      lastErrorRef.current = queryResult.error;
      toast.error(errorMessage);
    }
    if (!queryResult.error) lastErrorRef.current = null;
  }, [queryResult.error, errorMessage]);

  // ── Veri çıkarma ─────────────────────────────────────────────────────────
  const { rows, total } = queryResult.data
    ? extractData<T>(queryResult.data, queryKey)
    : { rows: [] as T[], total: 0 };
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    rows,
    total,
    page,
    setPage,
    totalPages,
    search: inputSearch,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    isLoading: queryResult.isLoading || queryResult.isFetching,
    refetch: queryResult.refetch,
  };
}
