import { useState } from 'react';
import { router } from 'expo-router';
import { appAlert } from '@tarodan/ui-native';
import { userApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { getRestrictionMessage, GuestAction } from '@/utils/guestRestrictions';

/**
 * Profile actions controller — logout, account deletion, and the guest
 * restriction snackbar/prompt state. Lifted verbatim from ProfileScreen.
 */
export function useProfileActions() {
  const { logout } = useAuthStore();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<
    'favorites' | 'message' | 'purchase' | 'trade' | 'collections'
  >('favorites');

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const handleDeleteAccount = () => {
    appAlert(
      'Hesabı Sil',
      'Hesabınız ve tüm verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabı Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await userApi.deleteAccount();
              await logout();
              router.replace('/(auth)/login');
            } catch (e: any) {
              appAlert('Hata', e?.response?.data?.message || 'Hesap silinemedi. Lütfen tekrar deneyin.');
            }
          },
        },
      ],
    );
  };

  const handleGuestAction = (action: GuestAction) => {
    const config = getRestrictionMessage(action);
    setSnackbarMessage(config.message);
    setSnackbarVisible(true);

    if (action === 'favorites' || action === 'wishlist') setPromptType('favorites');
    else if (action === 'message') setPromptType('message');
    else if (action === 'trade') setPromptType('trade');
    else if (action === 'collections') setPromptType('collections');

    setTimeout(() => setShowPrompt(true), 500);
  };

  return {
    snackbarVisible,
    setSnackbarVisible,
    snackbarMessage,
    showPrompt,
    setShowPrompt,
    promptType,
    handleLogout,
    handleDeleteAccount,
    handleGuestAction,
  };
}
