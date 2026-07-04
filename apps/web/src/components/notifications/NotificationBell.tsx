'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/24/solid';
import { Button, Spinner } from '@tarodan/ui';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import OptimizedImage from '@/components/OptimizedImage';

const STOCKOUT_TYPES = new Set([
  'order_cancelled_out_of_stock',
  'offer_cancelled_out_of_stock',
  'back_in_stock',
]);

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  icon?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

export default function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCountQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const response = await api.get('/notifications/unread-count');
      return response.data.count ?? response.data.unreadCount ?? 0;
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    meta: { page: 'notification-bell-count' },
  });
  const unreadCount = unreadCountQuery.data ?? 0;

  const notificationsQuery = useQuery({
    queryKey: ['notifications-bell'],
    queryFn: async (): Promise<Notification[]> => {
      const response = await api.get('/notifications', { params: { page: 1, limit: 5 } });
      const data = response.data.notifications || response.data.data || [];
      return data;
    },
    enabled: isAuthenticated && showDropdown,
    meta: { page: 'notification-bell-list' },
  });
  const notifications = notificationsQuery.data ?? [];
  const loading = notificationsQuery.isLoading;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications-bell'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to mark as read:', error);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications-bell'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to dismiss:', error);
    }
  };

  const handleBellClick = () => {
    setShowDropdown(!showDropdown);
  };

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return locale === 'en' ? 'now' : 'şimdi';
    if (diffMins < 60) return `${diffMins}${locale === 'en' ? 'm' : 'dk'}`;
    if (diffHours < 24) return `${diffHours}${locale === 'en' ? 'h' : 'sa'}`;
    return `${diffDays}${locale === 'en' ? 'd' : 'g'}`;
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="nav"
        size="icon"
        onClick={handleBellClick}
        aria-expanded={showDropdown}
        aria-label={locale === 'en' ? 'Notifications' : 'Bildirimler'}
        className="relative h-9 w-9 rounded-md"
      >
        {unreadCount > 0 ? (
          <BellSolidIcon className="w-6 h-6" />
        ) : (
          <BellIcon className="w-6 h-6" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 bg-surface-elevated text-primary-500 text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface-elevated rounded-xl shadow-xl border border-border-subtle overflow-hidden z-50">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-primary-50 to-primary-100 border-b border-primary-100">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-heading">
                  {locale === 'en' ? 'Notifications' : 'Bildirimler'}
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary-500 text-inverted rounded-full">
                    {unreadCount} {locale === 'en' ? 'new' : 'yeni'}
                  </span>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="md" color="border-primary-500 border-t-transparent" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <BellIcon className="w-10 h-10 text-border-strong mx-auto mb-2" />
                  <p className="text-sm text-muted">
                    {locale === 'en' ? 'No notifications yet' : 'Henüz bildirim yok'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`relative group px-4 py-3 hover:bg-surface transition-colors ${
                        !notification.isRead ? 'bg-primary-50/50' : ''
                      }`}
                    >
                      <Link
                        href={notification.link || notification.data?.link || '/notifications'}
                        onClick={() => {
                          if (!notification.isRead) {
                            markAsRead(notification.id);
                          }
                          setShowDropdown(false);
                        }}
                        className="block"
                      >
                        <div className="flex items-start gap-3">
                          {STOCKOUT_TYPES.has(notification.type) && notification.data?.productImage ? (
                            <div className="flex-shrink-0 w-10 h-10 relative rounded overflow-hidden bg-surface-alt">
                              <OptimizedImage
                                src={notification.data.productImage}
                                alt={notification.data.productTitle ?? ''}
                                fill
                                className="object-cover"
                                fallbackSrc="https://placehold.co/80x80/1a1a2e/666?text=?"
                                logContext={{ page: 'notification-bell' }}
                              />
                            </div>
                          ) : (
                            <span className="text-lg flex-shrink-0">
                              {notification.icon || notification.data?.icon || '🔔'}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={`text-sm ${
                                  !notification.isRead
                                    ? 'font-semibold text-heading'
                                    : 'font-medium text-body'
                                }`}
                              >
                                {notification.title}
                              </p>
                              <span className="text-xs text-subtle flex-shrink-0">
                                {getTimeAgo(notification.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5 line-clamp-1">
                              {notification.message}
                            </p>
                          </div>
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(notification.id);
                        }}
                        className="absolute top-2 right-2 h-6 w-6 rounded-md text-subtle opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={locale === 'en' ? 'Dismiss' : 'Kapat'}
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-surface border-t border-border-subtle">
              <Link
                href="/notifications"
                onClick={() => setShowDropdown(false)}
                className="block text-center text-sm font-medium text-primary-500 hover:text-primary-600"
              >
                {locale === 'en' ? 'View all notifications' : 'Tüm bildirimleri gör'}
              </Link>
            </div>
        </div>
      )}
    </div>
  );
}
