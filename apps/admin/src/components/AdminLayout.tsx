'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import clsx from 'clsx';
import {
  HomeIcon,
  UsersIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  MegaphoneIcon,
  ChatBubbleLeftRightIcon,
  TagIcon,
  SwatchIcon,
  TicketIcon,
  CalculatorIcon,
  BanknotesIcon,
  DocumentTextIcon,
  TruckIcon,
  MapIcon,
  BellAlertIcon,
  CubeIcon,
  BuildingOffice2Icon,
  ClipboardDocumentCheckIcon,
  StarIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Analizler', href: '/analytics', icon: ChartBarIcon },
  { name: 'Siparişler', href: '/orders', icon: ClipboardDocumentListIcon },
  { name: 'Kullanıcılar', href: '/users', icon: UsersIcon },
  { name: 'Ürünler', href: '/products', icon: ShoppingBagIcon },
  { name: 'Yorumlar', href: '/reviews', icon: StarIcon },
  { name: 'Kategoriler', href: '/categories', icon: CubeIcon },
  { name: 'Markalar', href: '/brands', icon: SwatchIcon },
  { name: 'Modeller', href: '/car-models', icon: TruckIcon },
  { name: 'Üreticiler', href: '/manufacturers', icon: BuildingOffice2Icon },
  { name: 'Ürün Özellikleri', href: '/attributes', icon: ClipboardDocumentListIcon },
  { name: 'Koleksiyonlar', href: '/collections', icon: ClipboardDocumentCheckIcon },
  { name: 'Etiketler', href: '/tags', icon: TagIcon },
  { name: 'İndirimler', href: '/discounts', icon: TicketIcon },
  { name: 'Mesajlar', href: '/messages', icon: ChatBubbleLeftRightIcon },
  { name: 'Kargo', href: '/shipping', icon: TruckIcon },
  { name: 'Bildirimler', href: '/notifications', icon: BellAlertIcon },
  { name: 'Komisyon', href: '/commission', icon: CurrencyDollarIcon },
  { name: 'Satıcı Başvuruları', href: '/sellers/applications', icon: ClipboardDocumentCheckIcon },
  { name: 'Satıcı Performansı', href: '/sellers/performance', icon: ChartBarIcon },
  { name: 'Satıcı Ödemeleri', href: '/payouts', icon: BanknotesIcon },
  { name: 'İade Geçmişi', href: '/refunds', icon: BanknotesIcon },
  { name: 'Vergi Ayarları', href: '/tax', icon: CalculatorIcon },

  { name: 'Sayfalar', href: '/pages', icon: DocumentTextIcon },
  { name: 'E-posta Şablonları', href: '/email-templates', icon: ChatBubbleLeftRightIcon },
  { name: 'Sistem Logları', href: '/logs', icon: ClipboardDocumentCheckIcon },
  { name: 'Rol Yönetimi', href: '/roles', icon: UserCircleIcon },
  { name: 'Ödeme Ayarları', href: '/settings/payments', icon: CreditCardIcon },
  { name: 'Sistem Ayarları', href: '/settings', icon: Cog6ToothIcon },
];


interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:translate-x-0 flex flex-col shadow-soft',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/tarodan-logo.jpg"
              alt="Tarodan Logo"
              width={120}
              height={40}
              className="object-contain"
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '40px' }}
              priority
            />
            <span className="ml-2 text-xs text-gray-500 font-medium">Admin</span>
          </Link>
          <button
            className="lg:hidden text-gray-400 hover:text-gray-700"
            onClick={() => setSidebarOpen(false)}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="h-5 w-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
              <span className="text-primary-600 font-semibold">
                {user?.displayName?.charAt(0) || 'A'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user?.displayName}</p>
              <p className="text-xs text-gray-500">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
          <div className="flex items-center">
            <button
              className="lg:hidden text-gray-500 hover:text-gray-700 mr-4"
              onClick={() => setSidebarOpen(true)}
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div className="hidden lg:flex items-center">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan Logo"
                width={100}
                height={32}
                className="object-contain"
                style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '32px' }}
              />
              <span className="ml-2 text-sm text-gray-500">Admin Panel</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-gray-500">{user?.email}</span>
            </div>
            <Link
              href="/settings"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <UserCircleIcon className="h-5 w-5" />
              <span className="hidden sm:inline text-sm">Profil</span>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
