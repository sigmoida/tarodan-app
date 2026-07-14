import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { appAlert } from '@tarodan/ui-native';
import { api } from '@/lib/api';
import { useRefresh } from '@/hooks/useRefresh';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_SETTINGS, type NotificationSettings } from '../_lib/types';

/**
 * Notification-settings controller — owns the local settings state synced from
 * GET /users/me/settings, the PATCH save mutation, per-key toggle and focus
 * refetch. Lifted verbatim from the monolithic screen (§12).
 */
export function useNotificationSettings() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

  const { data: settingsData, isLoading, refetch } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/settings').catch(() => null);
        return response?.data ?? null;
      } catch (error) {
        console.log('Failed to fetch settings');
        return null;
      }
    },
    enabled: isAuthenticated,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  useEffect(() => {
    if (settingsData) {
      setSettings((prev) => ({ ...prev, ...settingsData }));
    }
  }, [settingsData]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated]),
  );

  // Anahtarlar PATCH /users/me/settings (UpdateNotificationSettingsDto) ile birebir;
  // backend bu tercihleri gönderim yollarında uygular (Bulgu #9 fix).
  const saveMutation = useMutation({
    mutationFn: async (newSettings: NotificationSettings) => {
      return api.patch('/users/me/settings', newSettings).catch(() => null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      appAlert('Başarılı', 'Bildirim ayarları kaydedildi');
    },
  });

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  return {
    isAuthenticated,
    settings,
    isLoading,
    refreshing,
    onRefresh,
    saveMutation,
    handleToggle,
    handleSave,
  };
}

export type NotificationSettingsController = ReturnType<typeof useNotificationSettings>;
