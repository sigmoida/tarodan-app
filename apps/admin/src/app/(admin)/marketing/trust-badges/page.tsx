"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { clientListFetcher } from "@/lib/query/client-list";
import { TRUST_BADGE_MAX_ACTIVE, type TrustBadge } from "./_lib/types";
import { TrustBadgesTable } from "./_components/TrustBadgesTable";
import { TrustBadgeFormModal } from "./_modals/TrustBadgeFormModal";

export default function TrustBadgesPage() {
  const t = useTranslations();
  const [modal, setModal] = useState<{ badge?: TrustBadge } | null>(null);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.trustBadges.title")}
        description={t("admin.marketing.trustBadges.subtitle")}
      >
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            leftIcon={<PlusIcon className="h-5 w-5" />}
            onClick={() => setModal({})}
          >
            {t("admin.marketing.trustBadges.new")}
          </Button>
          <p className="text-xs text-muted">
            {t("admin.marketing.trustBadges.maxActiveNote", {
              max: TRUST_BADGE_MAX_ACTIVE,
            })}
          </p>
        </div>
      </PageHeader>

      <ResourceList<TrustBadge>
        resource="trust-badges"
        // Full-load: birkaç rozet; sıra sunucudan (`displayOrder`) gelir.
        fetcher={clientListFetcher<TrustBadge>(
          () => adminApi.getTrustBadges(),
          (raw) => (Array.isArray(raw) ? raw : (raw?.data ?? [])),
        )}
        limit={100}
        getRowId={(b) => b.id}
      >
        <TrustBadgesTable onEdit={(badge) => setModal({ badge })} />
      </ResourceList>

      {modal && (
        <TrustBadgeFormModal
          key={modal.badge?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          badge={modal.badge}
        />
      )}
    </AdminPage>
  );
}
