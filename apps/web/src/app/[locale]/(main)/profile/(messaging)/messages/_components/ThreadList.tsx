"use client";

import { Button, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { MessageThread } from "../_lib/messages";
import ThreadListItem from "./ThreadListItem";

export default function ThreadList({
  loading,
  threads,
  selectedThreadId,
  onSelect,
  hasMore,
  remainingCount,
  onExpand,
  className,
}: {
  loading: boolean;
  threads: MessageThread[];
  selectedThreadId?: string;
  onSelect: (thread: MessageThread) => void;
  hasMore: boolean;
  remainingCount: number;
  onExpand: () => void;
  className?: string;
}) {
  const t = useTranslations();

  return (
    <div
      className={`${className} flex-col min-h-0 bg-surface-elevated border-r border-border`}
    >
      <div className="flex-shrink-0 px-4 py-4 border-b border-border bg-surface-elevated">
        <h1 className="text-lg font-semibold text-heading">
          {t("message.messages")}
        </h1>
        <p className="text-xs text-muted mt-0.5">
          {t("message.selectConversationTitle")}
        </p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted p-6 text-center text-sm">
          {t("message.noMessages")}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col">
          {threads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isSelected={selectedThreadId === thread.id}
              onSelect={() => onSelect(thread)}
            />
          ))}
          {hasMore && (
            <div className="flex-shrink-0 p-2 border-t border-border-subtle">
              <Button
                variant="secondary"
                type="button"
                onClick={onExpand}
                className="w-full py-2.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
              >
                {t("message.moreCount", { count: remainingCount })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
