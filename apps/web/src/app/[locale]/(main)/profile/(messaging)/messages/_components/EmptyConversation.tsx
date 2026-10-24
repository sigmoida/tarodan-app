"use client";

import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "@tarodan/ui";
import { useTranslations } from "next-intl";

export default function EmptyConversation() {
  const t = useTranslations();

  return (
    <div className="hidden flex-1 items-center justify-center sm:flex">
      <EmptyState
        icon={<ChatBubbleLeftRightIcon className="h-7 w-7" />}
        title={t("message.selectConversation")}
        description={t("message.chooseThread")}
      />
    </div>
  );
}
