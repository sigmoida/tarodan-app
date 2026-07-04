'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface TopAd {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  content: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  deviceType: string;
}

/**
 * Owns the top-ads marquee state: fetches active header ads for the current
 * device, records one impression per ad, tracks image-load failures, and
 * derives whether ads should be shown at all (ad-free membership avantajı
 * admin'in tier ayarından gelir, hardcode DEĞİL).
 */
export function useTopAds() {
  const { isAuthenticated, user } = useAuthStore();
  const [topAds, setTopAds] = useState<TopAd[]>([]);
  const recordedImpressions = useRef<Set<string>>(new Set());
  const [adImageError, setAdImageError] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  // Reklamsız (ad-free) avantajı admin'in tier ayarından gelir (hardcode DEĞİL).
  const [isAdFree, setIsAdFree] = useState(false);

  // Reklam yalnız üyeliğinde "reklamsız" avantajı OLMAYANLARA gösterilir.
  // isAdFree değeri admin'in tier ayarından (/membership/me/limits) gelir;
  // tier ADINI hardcode etmek admin'in reklam-kapatma değişikliğini yok
  // sayıyordu (bug: reklam kapatılsa bile kullanıcı reklam görüyordu).
  const shouldShowAd = isAuthenticated ? !isAdFree : true;

  // Gerçek isAdFree'yi üyelik limitlerinden çek (hardcoded tier adı yerine).
  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdFree(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ isAdFree?: boolean }>('/membership/me/limits')
      .then((res) => {
        if (!cancelled) setIsAdFree(!!res.data?.isAdFree);
      })
      .catch(() => {
        if (!cancelled) setIsAdFree(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.membershipTier]);

  // Detect mobile/desktop for responsive ads
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch active top ads (public API, no auth) - with device type
  useEffect(() => {
    if (!shouldShowAd) return;
    const deviceType = isMobile ? 'mobile' : 'desktop';
    api.get<TopAd[]>('/ads/active', { params: { position: 'header', device: deviceType } })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTopAds(list);
        setAdImageError(new Set());
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') console.error('Failed to fetch ads:', err);
        setTopAds([]);
      });
  }, [shouldShowAd, isMobile]);

  // Record impression once per ad when bar is shown
  useEffect(() => {
    if (topAds.length === 0) return;
    topAds.forEach((ad) => {
      if (recordedImpressions.current.has(ad.id)) return;
      recordedImpressions.current.add(ad.id);
      api.post(`/ads/${ad.id}/impression`).catch(() => { });
    });
  }, [topAds]);

  const handleAdClick = (ad: { id: string; linkUrl: string | null }) => {
    api.post(`/ads/${ad.id}/click`).catch(() => { });
    if (ad.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
  };

  const handleAdImageError = (adId: string) => {
    setAdImageError((prev) => new Set(prev).add(adId));
  };

  return {
    shouldShowAd,
    topAds,
    isMobile,
    adImageError,
    handleAdClick,
    handleAdImageError,
  };
}
