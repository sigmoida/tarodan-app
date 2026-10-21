"use client";

import { Link } from "@/i18n/navigation";
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Alert, Button, Skeleton } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { EmptyStateCard } from "@/components/ui";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useSavedSearches } from "./_hooks/useSavedSearches";
import SavedSearchCard from "./_components/SavedSearchCard";
import { useTranslations } from "next-intl";

export default function SavedSearchesPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();

  const {
    savedSearches,
    total,
    limit,
    canUpgrade,
    colorOptions,
    isLoading,
    isError,
    refetch,
    remove,
    runSearch,
  } = useSavedSearches(ready);

  if (!ready) return <AuthLoadingScreen />;

  if (isLoading) {
    return (
      <PageShell className="pb-16">
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
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
          limit !== null && (
            <span className="text-sm text-muted">
              {t("search.countOfLimit", { count: total, limit })}
            </span>
          )
        }
      />

      {isError ? (
        <Alert
          variant="danger"
          title={t("savedSearch.loadFailed")}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("common.tryAgain")}
            </Button>
          }
        />
      ) : savedSearches.length === 0 ? (
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
              colorOptions={colorOptions}
              onDelete={remove}
              onRun={runSearch}
            />
          ))}
        </div>
      )}

      {limit !== null && total >= limit && (
        <Alert
          variant="warning"
          icon={
            <ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />
          }
          title={t("savedSearch.limitTitle")}
        >
          {t("search.savedLimitReached", { limit })}
          {canUpgrade && (
            <>
              {" "}
              <Link href="/membership" className="font-medium underline">
                {t("search.premiumMoreSearches")}
              </Link>
            </>
          )}
        </Alert>
      )}
    </PageShell>
  );
}
