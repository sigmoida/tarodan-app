'use client';

import Link from 'next/link';

interface User {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  _count?: {
    products?: number;
    orders?: number;
  };
}

interface UsersTableProps {
  users: User[];
  onSuspend?: (userId: string) => void;
  onActivate?: (userId: string) => void;
}

const roleLabels: Record<string, string> = {
  USER: 'Kullanıcı',
  SELLER: 'Satıcı',
  ADMIN: 'Admin',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-500/20 text-green-400',
  SUSPENDED: 'bg-red-500/20 text-red-400',
  PENDING: 'bg-yellow-500/20 text-yellow-400',
};

export function UsersTable({ users, onSuspend, onActivate }: UsersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Kullanıcı
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              E-posta
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Rol
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Durum
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Ürün
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Sipariş
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              Kayıt
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
              İşlem
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-border hover:bg-muted/50">
              <td className="py-3 px-4 font-medium">{user.displayName}</td>
              <td className="py-3 px-4 text-sm">{user.email}</td>
              <td className="py-3 px-4">
                <span className="text-sm">{roleLabels[user.role] || user.role}</span>
              </td>
              <td className="py-3 px-4">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[user.status] || 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {user.status === 'ACTIVE' ? 'Aktif' : user.status === 'SUSPENDED' ? 'Askıda' : user.status}
                </span>
              </td>
              <td className="py-3 px-4 text-sm">{user._count?.products || 0}</td>
              <td className="py-3 px-4 text-sm">{user._count?.orders || 0}</td>
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString('tr-TR')}
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-2">
                  <Link
                    href={`/users/${user.id}`}
                    className="text-primary hover:underline text-sm"
                  >
                    Detay
                  </Link>
                  {user.status === 'ACTIVE' ? (
                    <button
                      onClick={() => onSuspend?.(user.id)}
                      className="text-red-400 hover:underline text-sm"
                    >
                      Askıya Al
                    </button>
                  ) : (
                    <button
                      onClick={() => onActivate?.(user.id)}
                      className="text-green-400 hover:underline text-sm"
                    >
                      Aktifleştir
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UsersTable;
