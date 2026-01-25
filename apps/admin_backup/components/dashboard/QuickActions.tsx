'use client';

import Link from 'next/link';

interface QuickAction {
  label: string;
  href: string;
  icon: string;
  color: string;
}

const defaultActions: QuickAction[] = [
  { label: 'Yeni Ürün Onayla', href: '/products/pending', icon: '📦', color: 'bg-blue-500/10 text-blue-400' },
  { label: 'Siparişleri Görüntüle', href: '/orders', icon: '🛒', color: 'bg-green-500/10 text-green-400' },
  { label: 'Kullanıcıları Yönet', href: '/users', icon: '👥', color: 'bg-purple-500/10 text-purple-400' },
  { label: 'Raporları İndir', href: '/reports', icon: '📊', color: 'bg-orange-500/10 text-orange-400' },
  { label: 'Destek Talepleri', href: '/support', icon: '💬', color: 'bg-pink-500/10 text-pink-400' },
  { label: 'Ayarlar', href: '/settings', icon: '⚙️', color: 'bg-gray-500/10 text-gray-400' },
];

interface QuickActionsProps {
  actions?: QuickAction[];
}

export function QuickActions({ actions = defaultActions }: QuickActionsProps) {
  return (
    <div className="bg-card rounded-lg border">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold">Hızlı İşlemler</h3>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-muted ${action.color}`}
          >
            <span className="text-2xl">{action.icon}</span>
            <span className="text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default QuickActions;
