'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { useMessaging } from './_hooks/useMessaging';
import ThreadList from './_components/ThreadList';
import ChatHeader from './_components/ChatHeader';
import MessageBubble from './_components/MessageBubble';
import MessageComposer from './_components/MessageComposer';
import EmptyConversation from './_components/EmptyConversation';

export default function MessagesPage() {
  const router = useRouter();
  const { locale } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !authLoading && !isAuthenticated) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
    }
  }, [mounted, authLoading, isAuthenticated, router]);

  const vm = useMessaging(mounted && isAuthenticated);

  // Avoid hydration mismatch: render same placeholder until mounted and auth resolved.
  if (!mounted || authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface text-heading flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted text-sm">
            {locale === 'en' ? 'Loading...' : 'Yükleniyor...'}
          </div>
        </div>
      </div>
    );
  }

  const { selectedThread } = vm;

  return (
    <div className="min-h-screen bg-surface text-heading flex flex-col">
      <div className="flex-1 flex min-h-0 mx-auto w-full max-w-full lg:max-w-[90%] xl:max-w-[85%] overflow-hidden bg-surface-elevated border-x border-border sm:mt-0">
        <ThreadList
          className={`${selectedThread ? 'hidden sm:flex' : 'flex'} w-full sm:w-80`}
          loading={vm.loading}
          threads={vm.visibleThreads}
          selectedThreadId={selectedThread?.id}
          onSelect={vm.selectThread}
          hasMore={vm.hasMoreThreads}
          remainingCount={vm.remainingCount}
          onExpand={vm.expandThreads}
        />

        <div className={`${selectedThread ? 'flex' : 'hidden sm:flex'} flex-1 flex-col min-h-0 bg-surface min-w-0`}>
          {selectedThread ? (
            <>
              <ChatHeader
                thread={selectedThread}
                typing={vm.typing}
                onBack={() => vm.selectThread(null)}
              />

              <div ref={vm.messagesScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-4 space-y-3">
                  {vm.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isFromMe={message.senderId === vm.currentUserId}
                    />
                  ))}
                </div>
              </div>

              <MessageComposer
                newMessage={vm.newMessage}
                attachedUrls={vm.attachedUrls}
                contentWarning={vm.contentWarning}
                maxMessageLength={vm.maxMessageLength}
                sending={vm.sending}
                attaching={vm.attaching}
                onMessageChange={vm.onMessageChange}
                onAttachImage={vm.onAttachImage}
                onRemoveAttachment={vm.onRemoveAttachment}
                onSend={vm.onSend}
              />
            </>
          ) : (
            <EmptyConversation />
          )}
        </div>
      </div>
    </div>
  );
}
