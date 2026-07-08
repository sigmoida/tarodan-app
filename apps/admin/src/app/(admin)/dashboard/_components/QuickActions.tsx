import { type ComponentType } from 'react';
import Link from 'next/link';
import {
  ShoppingBagIcon,
  ChartBarIcon,
  UsersIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

const ACTIONS: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  box: string;
  icon_: string;
}[] = [
  { href: '/catalog/products', label: 'Ürünler', icon: ShoppingBagIcon, box: 'bg-primary-100', icon_: 'text-primary-600' },
  { href: '/operations/orders', label: 'Siparişler', icon: ChartBarIcon, box: 'bg-info-500/20', icon_: 'text-info-500' },
  { href: '/accounts/users', label: 'Kullanıcılar', icon: UsersIcon, box: 'bg-primary-500/20', icon_: 'text-primary-500' },
  { href: '/messaging/messages', label: 'Mesajlar', icon: ArrowsRightLeftIcon, box: 'bg-success-500/20', icon_: 'text-success-500' },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated p-4 transition-colors hover:border-primary-500/50"
          >
            <div className={`shrink-0 rounded-lg p-2 ${a.box}`}>
              <Icon className={`h-6 w-6 ${a.icon_}`} />
            </div>
            <span className="min-w-0 truncate font-medium text-heading">{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
