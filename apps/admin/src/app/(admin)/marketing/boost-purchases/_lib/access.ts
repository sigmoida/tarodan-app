/**
 * The boost write routes (grant, revoke, refund, pause, resume, extend) are
 * open to these roles only (`@Roles` on `AdminAdPackageController`); a
 * moderator reads the screen but sees no action.
 */
const BOOST_WRITE_ROLES: readonly string[] = ["super_admin", "admin"];

export interface BoostActionAccess {
  /** Grant, revoke, pause, resume and extend: the role and `ads`. */
  manage: boolean;
  /** Refund and stop moves money: `manage` and `payments` too. */
  refund: boolean;
}

/**
 * What the current admin may do on the boost screens. A UX gate only; the API
 * authorizes every call (`@RequireAllPermissions("ads", "payments")` on the
 * refund). `can` is `usePermissions().can`, which passes a super admin.
 */
export function boostActionAccess(
  role: string | null | undefined,
  can: (permission: string) => boolean,
): BoostActionAccess {
  const manage = !!role && BOOST_WRITE_ROLES.includes(role) && can("ads");
  return { manage, refund: manage && can("payments") };
}
