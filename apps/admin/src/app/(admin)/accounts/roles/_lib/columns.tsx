import { Badge } from '@tarodan/ui';
import { col, type RowActionItem } from '@/components/table';
import { ROLE_META, ROLE_BADGE_VARIANT, type RoleId } from './constants';
import type { StaffItem } from './types';

/**
 * Yönetici kullanıcı tablosu kolonları. İzin sayısı için canlı `permissions`
 * (rol → izin listesi) haritasını alır; satır menüsü çağırandan gelir.
 */
export function staffColumns(
  permissions: Record<string, string[]>,
  rowMenu: (s: StaffItem) => RowActionItem[],
) {
  return [
    col.text<StaffItem>('Kullanıcı', (s) => s.name),
    col.muted<StaffItem>('E-posta', (s) => s.email),
    col.badge<StaffItem>('Rol', (s) => (
      <Badge variant={ROLE_BADGE_VARIANT[s.role as RoleId] ?? 'default'}>
        {ROLE_META[s.role as RoleId]?.label ?? s.role}
      </Badge>
    )),
    col.muted<StaffItem>('İzin Sayısı', (s) =>
      s.role === 'super_admin' ? 'Tümü (kilitli)' : `${(permissions[s.role] ?? []).length} izin`,
    ),
    col.badge<StaffItem>('Durum', (s) => <Badge active={s.isActive} />),
    col.date<StaffItem>('Son Giriş', (s) => s.lastLoginAt),
    col.rowMenu<StaffItem>(rowMenu),
  ];
}
