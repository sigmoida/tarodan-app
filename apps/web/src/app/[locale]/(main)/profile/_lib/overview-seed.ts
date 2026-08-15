import type { WebUser } from "@/lib/auth.config";
import { getTierDefault } from "./tiers";
import type { PendingCounts, UserProfile } from "./types";
import type { Translate } from "@/types/i18n";

export interface ProfileOverviewSeed {
  profile: UserProfile;
  pendingCounts: PendingCounts;
}

/**
 * Server seed for the profile overview query, built from the verified session so
 * the dashboard header (name, avatar, tier) ships in the initial HTML instead of
 * flashing a placeholder. Identity only — stats / pending counts are the client
 * aggregate's job; the layout marks this seed stale so the client refetches the
 * full 8-call aggregate once on mount to fill them.
 */
export function buildOverviewSeed(
  user: WebUser,
  t: Translate,
): ProfileOverviewSeed {
  const tierType = user.membershipTier || "free";
  return {
    profile: {
      id: user.id,
      adminCode: user.adminCode || "",
      username: user.username || "",
      usernameClaimedAt: user.usernameClaimed ? new Date().toISOString() : null,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isSeller: user.isSeller,
      isVerified: false,
      createdAt: new Date().toISOString(),
      membershipTier: tierType,
      membership: {
        tier: getTierDefault(t, tierType),
        status: "active",
        expiresAt: null,
      },
    },
    pendingCounts: { offers: 0, trades: 0 },
  };
}
