"use client";

import { useState, useEffect, useRef } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { BellIcon as BellSolidIcon } from "@heroicons/react/24/solid";
import { Button, Spinner } from "@tarodan/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useUnreadNotificationCount } from "@/hooks/useHeaderBadgeCounts";
import { useTranslations } from "next-intl";

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
  const t = useTranslations();
  const { isAuthenticated } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCountQuery = useUnreadNotificationCount(isAuthenticated);
  const unreadCount = unreadCountQuery.data ?? 0;

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.bell(),
    queryFn: async (): Promise<Notification[]> => {
      const response = await api.get("/notifications", {
        params: { page: 1, limit: 5 },
      });
      const data = response.data.notifications || response.data.data || [];
      return data;
    },
    enabled: isAuthenticated && showDropdown,
    meta: { page: "notification-bell-list" },
  });
  const notifications = notificationsQuery.data ?? [];
  const loading = notificationsQuery.isLoading;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.unreadCount(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.bell(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all(),
        }),
      ]);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to mark as read:", error);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.unreadCount(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.bell(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all(),
        }),
      ]);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to dismiss:", error);
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

    if (diffMins < 1) return t("time.now");
    if (diffMins < 60) return `${diffMins}${t("time.minuteShort")}`;
    if (diffHours < 24) return `${diffHours}${t("time.hourShort")}`;
    return `${diffDays}${t("time.dayShort")}`;
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
        aria-label={t("notification.notifications")}
        className="relative h-9 w-9 rounded-md"
      >
        {unreadCount > 0 ? (
          <BellSolidIcon className="w-6 h-6" />
        ) : (
          <BellIcon className="w-6 h-6" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-500 px-1 text-2xs font-semibold text-inverted">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface-elevated rounded-xl shadow-xl border border-border-subtle overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-heading">
                {t("notification.notifications")}
              </h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary-500 text-inverted rounded-full">
                  {unreadCount} {t("notification.newBadge")}
                </span>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner
                  size="md"
                  color="border-primary-500 border-t-transparent"
                />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 px-4">
                <BellIcon className="w-10 h-10 text-border-strong mx-auto mb-2" />
                <p className="text-sm text-muted">
                  {t("notification.noNotifications")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`relative group px-4 py-3 hover:bg-surface transition-colors ${
                      !notification.isRead ? "bg-primary-50/50" : ""
                    }`}
                  >
                    <Link
                      href={
                        notification.link ||
                        notification.data?.link ||
                        "/profile/notifications"
                      }
                      onClick={() => {
                        if (!notification.isRead) {
                          markAsRead(notification.id);
                        }
                        setShowDropdown(false);
                      }}
                      className="block"
                    >
                      <div className="flex items-start gap-3">
                        {/* Leading unread indicator — reserves the same width
                              when read so titles stay aligned. Kept on the left
                              so it never collides with the top-right dismiss X. */}
                        <span
                          className="mt-1.5 h-2 w-2 flex-shrink-0"
                          aria-hidden="true"
                        >
                          {!notification.isRead && (
                            <span className="block h-2 w-2 rounded-full bg-primary-500" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-sm ${
                                !notification.isRead
                                  ? "font-semibold text-heading"
                                  : "font-medium text-body"
                              }`}
                            >
                              {notification.title}
                            </p>
                            {/* Time hides on hover so the dismiss X can take its spot */}
                            <span className="text-xs text-subtle flex-shrink-0 transition-opacity group-hover:opacity-0">
                              {getTimeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-0.5 line-clamp-1">
                            {notification.message}
                          </p>
                        </div>
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
                      aria-label={t("common.close")}
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
              href="/profile/notifications"
              onClick={() => setShowDropdown(false)}
              className="block text-center text-sm font-medium text-primary-500 hover:text-primary-600"
            >
              {t("notification.viewAll")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
