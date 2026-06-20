import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'require_permission';

/**
 * Bu endpoint için gereken izin anahtarı (admin_role_permissions matrisinden kontrol edilir).
 * RolesGuard tarafından @Roles kontrolünden SONRA ek olarak denetlenir.
 * super_admin bu kontrolü her zaman geçer.
 *
 * @example @RequirePermission('orders.manage')
 */
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);
