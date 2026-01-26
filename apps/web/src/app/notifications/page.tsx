'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellIcon,
  CheckIcon,
  TrashIcon,
  FunnelIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';

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

type FilterType = 'all' | 'unread' | 'orders' | 'offers' | 'trades' | 'messages' | 'other';

const NOTIFICATION_CATEGORIES: Record<string, FilterType> = {
  order_created: 'orders',
  order_paid: 'orders',
  order_shipped: 'orders',
  order_delivered: 'orders',
  order_completed: 'orders',
  order_cancelled: 'orders',
  order_refunded: 'orders',
  payment_received: 'orders',
  payment_released: 'orders',
  product_sold: 'orders',
  offer_received: 'offers',
  offer_accepted: 'offers',
  offer_rejected: 'offers',
  offer_counter: 'offers',
  offer_expired: 'offers',
  trade_received: 'trades',
  trade_accepted: 'trades',
  trade_rejected: 'trades',
  trade_shipped: 'trades',
  trade_completed: 'trades',
  new_message: 'messages',
};

const FILTER_LABELS: Record<FilterType, { tr: string; en: string }> = {
  all: { tr: 'Tümü', en: 'All' },
  unread: { tr: 'Okunmamış', en: 'Unread' },
  orders: { tr: 'Siparişler', en: 'Orders' },
  offers: { tr: 'Teklifler', en: 'Offers' },
  trades: { tr: 'Takaslar', en: 'Trades' },
  messages: { tr: 'Mesajlar', en: 'Messages' },
  other: { tr: 'Diğer', en: 'Other' },
};

export default function NotificationsPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/notifications');
      return;
    }
    loadNotifications();
  }, [isAuthenticated]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const response = await api.get('/notifications', {
        params: { page: 1, limit: 100 },
      });
      const data = response.data.notifications || response.data.data || [];
      setNotifications(data);
    } catch (error) {
      console.error('Notifications load error:', error);
      toast.error(t('common.operationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success(locale === 'en' ? 'All marked as read' : 'Tümü okundu olarak işaretlendi');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error(t('common.operationFailed'));
    }
  };

  const getNotificationCategory = (type: string): FilterType => {
    return NOTIFICATION_CATEGORIES[type] || 'other';
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.isRead;
    return getNotificationCategory(n.type) === filter;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return locale === 'en' ? 'Just now' : 'Az önce';
    if (diffMins < 60) return locale === 'en' ? `${diffMins}m ago` : `${diffMins} dk önce`;
    if (diffHours < 24) return locale === 'en' ? `${diffHours}h ago` : `${diffHours} sa önce`;
    if (diffDays < 7) return locale === 'en' ? `${diffDays}d ago` : `${diffDays} gün önce`;
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center">
                <BellSolidIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {locale === 'en' ? 'Notifications' : 'Bildirimler'}
                </h1>
                <p className="text-sm text-gray-500">
                  {unreadCount > 0
                    ? locale === 'en'
                      ? `${unreadCount} unread`
                      : `${unreadCount} okunmamış`
                    : locale === 'en'
                    ? 'All caught up!'
                    : 'Tümü okundu!'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {locale === 'en' ? 'Mark all read' : 'Tümünü oku'}
                  </span>
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-lg transition-colors ${
                  showFilters ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <FunnelIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 pt-4">
                  {(Object.keys(FILTER_LABELS) as FilterType[]).map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setFilter(filterKey)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                        filter === filterKey
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {FILTER_LABELS[filterKey][locale as 'tr' | 'en']}
                      {filterKey === 'unread' && unreadCount > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mb-4"></div>
            <p className="text-gray-500">{locale === 'en' ? 'Loading...' : 'Yükleniyor...'}</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 bg-white rounded-2xl shadow-sm"
          >
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BellIcon className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {filter === 'unread'
                ? locale === 'en'
                  ? 'No unread notifications'
                  : 'Okunmamış bildirim yok'
                : locale === 'en'
                ? 'No notifications yet'
                : 'Henüz bildirim yok'}
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              {locale === 'en'
                ? 'When you receive notifications, they will appear here.'
                : 'Bildirimleriniz burada görünecek.'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.map((notification, index) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`relative bg-white rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md ${
                  !notification.isRead ? 'ring-2 ring-orange-200' : ''
                }`}
              >
                {/* Unread indicator */}
                {!notification.isRead && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-400 to-orange-600" />
                )}

                <div className="p-4 pl-5">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                        !notification.isRead
                          ? 'bg-orange-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      {notification.icon || notification.data?.icon || '🔔'}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3
                            className={`font-medium ${
                              !notification.isRead ? 'text-gray-900' : 'text-gray-700'
                            }`}
                          >
                            {notification.title}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {getTimeAgo(notification.createdAt)}
                          </span>
                          {!notification.isRead && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                              className="p-1 text-gray-400 hover:text-orange-500 transition-colors"
                              title={locale === 'en' ? 'Mark as read' : 'Okundu işaretle'}
                            >
                              <CheckIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Link */}
                      {(notification.link || notification.data?.link) && (
                        <Link
                          href={notification.link || notification.data?.link || '#'}
                          onClick={() => {
                            if (!notification.isRead) {
                              markAsRead(notification.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-sm text-orange-500 hover:text-orange-600 font-medium mt-2"
                        >
                          {locale === 'en' ? 'View details' : 'Detayları gör'}
                          <span>→</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
