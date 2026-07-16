import { useQuery } from '@tanstack/react-query';
import { appConfigApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { getAppPlatform, getAppVersion, storeUrlFor } from '@/constants/appUpdate';

export interface ForceUpdateState {
  /** Client is below the minimum supported version → block. */
  updateRequired: boolean;
  /** A newer non-forced version exists → optional soft nudge. */
  updateAvailable: boolean;
  /** Store URL for this platform, or null on web/unknown. */
  storeUrl: string | null;
  isLoading: boolean;
}

/**
 * Launch-time force-update check (#233). Reads the current platform + app
 * version and asks the API (#232, GET /app-config) whether this build is below
 * the minimum supported version.
 *
 * Fail-open by design: any network error, unknown version, or web/unknown
 * platform leaves `updateRequired` false so a failed check never locks users
 * out. The single retry keeps a transient blip from flashing the gate.
 */
export function useForceUpdate(): ForceUpdateState {
  const platform = getAppPlatform();
  const version = getAppVersion();
  const enabled = !!platform && !!version;

  const { data, isLoading } = useQuery({
    queryKey: qk.appConfig.check(platform ?? 'none', version ?? 'none'),
    queryFn: () => appConfigApi.getAppConfig(platform!, version!).then((r) => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    updateRequired: data?.updateRequired === true,
    updateAvailable: data?.updateAvailable === true,
    storeUrl: platform ? storeUrlFor(platform) : null,
    isLoading: enabled && isLoading,
  };
}
