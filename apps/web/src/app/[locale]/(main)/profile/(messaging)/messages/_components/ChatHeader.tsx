"use client";

import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { IconButton } from "@tarodan/ui";
import UserAvatar from "@/components/UserAvatar";
import { useTranslations } from "next-intl";
import type { MessageThread } from "../_lib/messages";
import { publicNameOf } from "@/lib/public-name";
import UserActionsMenu from "@/components/UserActionsMenu";

export default function ChatHeader({
  thread,
  typing,
  onBack,
  onReport,
  onBlocked,
}: {
  thread: MessageThread;
  typing: boolean;
  onBack: () => void;
  onReport: () => void;
  onBlocked: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex-shrink-0 h-[72px] px-6 bg-surface-elevated border-b border-border flex items-center gap-3">
      <IconButton
        variant="ghost"
        size="sm"
        className="sm:hidden -ml-1"
        aria-label={t("common.back")}
        onClick={onBack}
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </IconButton>
      <UserAvatar
        displayName={publicNameOf(thread.otherUser)}
        avatarUrl={thread.otherUser?.avatarUrl}
        size="sm"
        className="flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-heading text-sm truncate">
          {publicNameOf(thread.otherUser, t("common.user"))}
        </p>
        {typing ? (
          <p className="text-xs text-primary-600 truncate">
            {t("message.typing")}
          </p>
        ) : thread.product ? (
          <p className="text-xs text-primary-600 truncate">
            {thread.product.title}
          </p>
        ) : null}
      </div>
      {thread.otherUser?.id && (
        <UserActionsMenu
          userId={thread.otherUser.id}
          userName={publicNameOf(thread.otherUser, t("common.user"))}
          onReport={onReport}
          onBlocked={onBlocked}
        />
      )}
    </div>
  );
}
