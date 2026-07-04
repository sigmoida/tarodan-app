// Roller & izinler — paylaşılan tipler.

export interface StaffItem {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

/** Tek bir izin (sayfa başına tek anahtar, görüntüle/yönet ayrımı yok). */
export interface PermDef {
  key: string;
  label: string;
  description: string;
  pages: string[];
}

/** İzin matrisinde bir bölüm (ör. "Operasyon"). */
export interface PermGroup {
  id: string;
  group: string;
  permissions: PermDef[];
}
