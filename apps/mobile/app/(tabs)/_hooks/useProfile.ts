import { useProfileData } from './useProfileData';
import { useProfileActions } from './useProfileActions';

/**
 * Combined profile controller — merges the data and actions hooks into a single
 * object the thin screen passes to its sections as `f`.
 */
export function useProfile() {
  return { ...useProfileData(), ...useProfileActions() };
}

export type ProfileController = ReturnType<typeof useProfile>;
