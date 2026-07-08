// Roles & permissions — shared types.

export interface StaffItem {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

/** A single permission (one key per page, no view/manage distinction). */
export interface PermDef {
  key: string;
  label: string;
  description: string;
  pages: string[];
}

/** A section in the permission matrix (e.g. "Operasyon"). */
export interface PermGroup {
  id: string;
  group: string;
  permissions: PermDef[];
}
