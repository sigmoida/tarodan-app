"use client";

import { Button } from "@tarodan/ui";
import UserAvatar from "@/components/UserAvatar";
import type { BlockedUser } from "@/lib/api";
import { publicNameOf } from "@/lib/public-name";
import { useLocale, useTranslations } from "next-intl";

export default function BlockedUserRow({
  item,
  busy,
  onUnblock,
}: {
  item: BlockedUser;
  busy: boolean;
  onUnblock: (userId: string, name: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const name = publicNameOf(item, t("common.user"));
  const date = new Date(item.blockedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Engelli profile link verilmez: API zaten 404 döner.
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-elevated p-4">
      <UserAvatar displayName={name} avatarUrl={item.avatarUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-heading">{name}</h3>
        <p className="mt-1 text-sm text-subtle">
          {t("profile.blockedPage.blockedAt", { date })}
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() => onUnblock(item.id, name)}
        disabled={busy}
      >
        {t("profile.unblock")}
      </Button>
    </div>
  );
}
