import { useEffect, useState } from 'react';
import { useGuestStore } from '@/stores/guestStore';

type PromptType = 'favorites' | 'message' | 'purchase' | 'trade' | 'collections';

/** Misafir kullanıcı için görüntülenme sayımı + gecikmeli signup prompt. */
export function useGuestPrompt(productId: string, isAuthenticated: boolean) {
  const { incrementProductView, getPromptType, setLastPromptShown, canShowPrompt } =
    useGuestStore();

  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<PromptType | null>(null);

  useEffect(() => {
    if (!isAuthenticated && productId) {
      incrementProductView();
      const type = getPromptType() as PromptType | null;
      if (type && canShowPrompt()) {
        const timer = setTimeout(() => {
          setPromptType(type);
          setShowPrompt(true);
          setLastPromptShown(type);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, isAuthenticated]);

  return { showPrompt, promptType, dismissPrompt: () => setShowPrompt(false) };
}
