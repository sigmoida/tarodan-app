"use client";

import { Link } from "@/i18n/navigation";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { EmptyStateCard } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useSavedSearches } from "./_hooks/useSavedSearches";
import SavedSearchCard from "./_components/SavedSearchCard";
import { useTranslations } from "next-intl";

export default function SavedSearchesPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);

  const { savedSearches, isLoading, remove, toggleNotify, runSearch } =
    useSavedSearches(ready);

  const searchLimit =
    user?.membershipTier === "free"
      ? 5
      : user?.membershipTier === "basic"
        ? 10
        : user?.membershipTier === "premium"
          ? 20
          : 50;

  if (!ready) return <AuthLoadingScreen />;

  if (isLoading) {
    return (
      <PageShell className="pb-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-border-subtle" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-border-subtle" />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("search.savedTitle")}
        description={t("search.savedDescription")}
        actions={
          <span className="text-sm text-muted">
            {t("search.countOfLimit", {
              count: savedSearches.length,
              limit: searchLimit,
            })}
          </span>
        }
      />

      {savedSearches.length === 0 ? (
        <EmptyStateCard
          title={t("search.savedEmptyTitle")}
          description={t("search.savedEmptyDescription")}
          action={
            <Button asChild className="gap-2">
              <Link href="/listings">
                <MagnifyingGlassIcon className="h-5 w-5" />
                {t("search.searchListings")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {savedSearches.map((search) => (
            <SavedSearchCard
              key={search.id}
              search={search}
              onToggleNotify={toggleNotify}
              onDelete={remove}
              onRun={runSearch}
            />
          ))}
        </div>
      )}

      {savedSearches.length >= searchLimit && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
          <p className="text-sm text-warning-800">
            {t("search.savedLimitReached", { limit: searchLimit })}{" "}
            {user?.membershipTier === "free" && (
              <Link href="/membership" className="font-medium underline">
                {t("search.premiumMoreSearches")}
              </Link>
            )}
          </p>
        </div>
      )}
    </PageShell>
  );
}
