'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const menuItems = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Analitik', href: '/analytics', icon: '📈' },
  { label: 'Siparişler', href: '/orders', icon: '🛒' },
  { label: 'Kullanıcılar', href: '/users', icon: '👥' },
  { label: 'Ürünler', href: '/products', icon: '📦' },
  { label: 'Takas', href: '/trades', icon: '🔄' },
  { label: 'Mesajlar', href: '/messages', icon: '💬' },
  { label: 'Moderasyon', href: '/moderation', icon: '🛡️' },
  { label: 'Raporlar', href: '/reports', icon: '📑' },
  { label: 'Komisyon', href: '/commission', icon: '💰' },
  { label: 'Destek', href: '/support', icon: '🎧' },
  { label: 'Ayarlar', href: '/settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl">🎯</span>
          <span className="text-xl font-bold">Tarodan</span>
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
            Admin
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <p>Tarodan Admin v1.0</p>
          <p>© 2024 Tarodan</p>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
