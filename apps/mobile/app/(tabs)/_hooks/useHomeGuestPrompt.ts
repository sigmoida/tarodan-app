import { useEffect, useState } from 'react';
import { useGuestStore } from '@/stores/guestStore';

type PromptType = 'favorites' | 'message' | 'purchase';

/** Misafir kullanıcı için gecikmeli signup prompt (3sn). */
export function useHomeGuestPrompt(isAuthenticated: boolean) {
  const { getPromptType, setLastPromptShown, canShowPrompt } = useGuestStore();
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<PromptType | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      const type = getPromptType() as PromptType | null;
      if (type && canShowPrompt()) {
        const timer = setTimeout(() => {
          setPromptType(type);
          setShowPrompt(true);
          setLastPromptShown(type);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated, getPromptType, canShowPrompt, setLastPromptShown]);

  return { showPrompt, promptType, dismissPrompt: () => setShowPrompt(false) };
}
