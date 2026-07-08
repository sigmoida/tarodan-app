'use client';

import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

export default function EmptyConversation() {
  const { t, locale } = useTranslation();

  return (
    <div className="flex-1 hidden sm:flex flex-col items-center justify-center text-muted p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-border-subtle flex items-center justify-center text-subtle mb-4">
        <ChatBubbleLeftRightIcon className="w-8 h-8" />
      </div>
      <p className="font-medium text-muted">{t('message.selectConversation')}</p>
      <p className="text-sm mt-1">{locale === 'en' ? 'Choose a thread from the list' : 'Listeden bir sohbet seçin'}</p>
    </div>
  );
}
