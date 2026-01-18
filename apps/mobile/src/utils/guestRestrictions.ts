import { router } from 'expo-router';

export type GuestAction = 
  | 'favorites'
  | 'message'
  | 'trade'
  | 'collections'
  | 'rate'
  | 'comment'
  | 'sell'
  | 'wishlist'
  | 'follow';

interface RestrictionConfig {
  title: string;
  message: string;
  redirectTo: '/(auth)/login' | '/(auth)/register';
}

const RESTRICTION_MESSAGES: Record<GuestAction, RestrictionConfig> = {
  favorites: {
    title: 'Favorilere Ekle',
    message: 'Favorilere eklemek için üye olun',
    redirectTo: '/(auth)/register',
  },
  message: {
    title: 'Mesaj Gönder',
    message: 'Satıcıyla mesajlaşmak için giriş yapın',
    redirectTo: '/(auth)/login',
  },
  trade: {
    title: 'Takas Teklifi',
    message: 'Takas yapabilmek için premium üye olun',
    redirectTo: '/(auth)/register',
  },
  collections: {
    title: 'Koleksiyon Oluştur',
    message: 'Digital Garage oluşturmak için premium üye olun',
    redirectTo: '/(auth)/register',
  },
  rate: {
    title: 'Değerlendir',
    message: 'Değerlendirme yapmak için giriş yapın',
    redirectTo: '/(auth)/login',
  },
  comment: {
    title: 'Yorum Yap',
    message: 'Yorum yapmak için giriş yapın',
    redirectTo: '/(auth)/login',
  },
  sell: {
    title: 'İlan Ver',
    message: 'İlan vermek için üye olun',
    redirectTo: '/(auth)/register',
  },
  wishlist: {
    title: 'İstek Listesi',
    message: 'İstek listesi oluşturmak için üye olun',
    redirectTo: '/(auth)/register',
  },
  follow: {
    title: 'Takip Et',
    message: 'Satıcıları takip etmek için üye olun',
    redirectTo: '/(auth)/register',
  },
};

export function getRestrictionMessage(action: GuestAction): RestrictionConfig {
  return RESTRICTION_MESSAGES[action];
}

export function handleGuestAction(
  action: GuestAction,
  isAuthenticated: boolean,
  onShowSnackbar: (message: string) => void,
  onSuccess?: () => void
): boolean {
  if (isAuthenticated) {
    onSuccess?.();
    return true;
  }

  const config = getRestrictionMessage(action);
  onShowSnackbar(config.message);
  
  // Delay redirect to show snackbar
  setTimeout(() => {
    router.push(config.redirectTo);
  }, 1500);
  
  return false;
}

export function checkGuestAccess(
  isAuthenticated: boolean,
  action: GuestAction
): { allowed: boolean; message?: string; redirectTo?: string } {
  if (isAuthenticated) {
    return { allowed: true };
  }

  const config = getRestrictionMessage(action);
  return {
    allowed: false,
    message: config.message,
    redirectTo: config.redirectTo,
  };
}
