import { SetMetadata } from "@nestjs/common";
import type { AdminPermissionKey } from "../../admin/dto/role-permissions.dto";

export const PERMISSION_KEY = "require_permission";
export const ALL_PERMISSIONS_KEY = "require_all_permissions";

/**
 * The permission this endpoint needs (from the `admin_role_permissions`
 * matrix), checked by RolesGuard after `@Roles`. It replaces the URL
 * segment's entry in `PERMISSION_MAP`. `super_admin` always passes.
 *
 * @example @RequirePermission('orders')
 */
export const RequirePermission = (key: string) =>
  SetMetadata(PERMISSION_KEY, key);

/**
 * Every listed permission is needed, for an action that belongs to two
 * screens at once, such as a boost refund (`ads` and `payments`). Like
 * `@RequirePermission` it replaces the URL segment's entry in
 * `PERMISSION_MAP`; a `@RequirePermission` next to it (on the class, say) is
 * needed as well. `super_admin` always passes.
 *
 * @example @RequireAllPermissions('ads', 'payments')
 */
export const RequireAllPermissions = (
  ...keys: [AdminPermissionKey, AdminPermissionKey, ...AdminPermissionKey[]]
) => SetMetadata(ALL_PERMISSIONS_KEY, keys);
