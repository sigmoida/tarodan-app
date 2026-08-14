"use client";

import { useTranslations } from "next-intl";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { PROFILE_PANE_HEIGHT } from "../../_lib/layout";
import { useMessaging } from "./_hooks/useMessaging";
import ThreadList from "./_components/ThreadList";
import ChatHeader from "./_components/ChatHeader";
import MessageBubble from "./_components/MessageBubble";
import MessageComposer from "./_components/MessageComposer";
import EmptyConversation from "./_components/EmptyConversation";

export default function MessagesPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();

  const vm = useMessaging(ready);

  // Avoid hydration mismatch: render same placeholder until mounted and auth resolved.
  if (!ready) {
    return (
      <div className="min-h-dvh bg-surface text-heading flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted text-sm">
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  const { selectedThread } = vm;

  return (
    <div
      className={`${PROFILE_PANE_HEIGHT} bg-surface text-heading flex flex-col`}
    >
      <div className="flex-1 flex min-h-0 mx-auto w-full max-w-full overflow-hidden bg-surface-elevated rounded-lg border border-border sm:shadow-sm">
        <ThreadList
          className={`${selectedThread ? "hidden sm:flex" : "flex"} w-full sm:w-80`}
          loading={vm.loading}
          threads={vm.visibleThreads}
          selectedThreadId={selectedThread?.id}
          onSelect={vm.selectThread}
          hasMore={vm.hasMoreThreads}
          remainingCount={vm.remainingCount}
          onExpand={vm.expandThreads}
        />

        <div
          className={`${selectedThread ? "flex" : "hidden sm:flex"} flex-1 flex-col min-h-0 bg-surface min-w-0`}
        >
          {selectedThread ? (
            <>
              <ChatHeader
                thread={selectedThread}
                typing={vm.typing}
                onBack={() => vm.selectThread(null)}
              />

              <div
                ref={vm.messagesScrollRef}
                className="flex-1 min-h-0 overflow-y-auto"
              >
                <div className="px-6 py-4 space-y-3">
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
