import { SetMetadata } from '@nestjs/common';

export const BYPASS_PERMISSION_MATRIX_KEY = 'bypass_permission_matrix';

/**
 * Rol kontrolü yapılır fakat izin matrisi (platform_settings) sorgulanmaz.
 * Sadece rolün kendisi yeterli olduğu endpoint'lerde kullanılır.
 * Örnek: izin matrisini okuyan endpoint — döngüsel 403'ü kaldırır.
 */
export const BypassPermissionMatrix = () => SetMetadata(BYPASS_PERMISSION_MATRIX_KEY, true);
