/** @format */

"use client";

import {
  resolveBannerVisibility,
  type BannerVisibility,
} from "@/lib/ads/adVisibility";
import { useAuthStore } from "@/stores/authStore";
import {
  useMembershipLimits,
  type MembershipLimits,
} from "./useMembershipLimits";

const selectIsAdFree = (limits: MembershipLimits): boolean =>
  limits.isAdFree === true;

/**
 * Whether ad slots show: follows the tier's `isAdFree` flag (rule:
 * `resolveBannerVisibility`). The limits query runs only for a signed-in
 * user; a guest makes no extra request. The data stays cached, so the last
 * known value holds even when `checkAuth` turns `isLoading` on again.
 */
export function useBannerVisibility(): BannerVisibility {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore();

  const limits = useMembershipLimits(selectIsAdFree, {
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
  });

  return resolveBannerVisibility({
    isAuthLoading,
    isAuthenticated,
    limitsStatus: limits.status,
    isAdFree: limits.data,
  });
}
