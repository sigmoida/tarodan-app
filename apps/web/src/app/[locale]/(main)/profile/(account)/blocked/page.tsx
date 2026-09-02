"use client";

import { Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyStateCard } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useBlockUser } from "@/hooks/useBlockUser";
import { useBlockedUsers } from "./_hooks/useBlockedUsers";
import BlockedUserRow from "./_components/BlockedUserRow";
import { useTranslations } from "next-intl";

/**
 * Profil → Engellenen Kullanıcılar (Apple App Review: engellenenler listesi +
 * engel kaldırma). Mobil `settings/blocked-users` ile aynı içerik.
 */
export default function BlockedUsersPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();
  const { blocked, isLoading } = useBlockedUsers(ready);
  const { requestUnblock, pending } = useBlockUser();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("profile.blockedPage.title")}
        description={t("profile.blockedPage.description", {
          count: blocked.length,
        })}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="xl" />
        </div>
      ) : blocked.length === 0 ? (
        <EmptyStateCard
          title={t("profile.blockedPage.empty")}
          description={t("profile.blockedPage.emptyDesc")}
        />
      ) : (
        <div className="grid gap-4">
          {blocked.map((item) => (
            <BlockedUserRow
              key={item.id}
              item={item}
              busy={pending}
              onUnblock={(userId, name) => void requestUnblock(userId, name)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
