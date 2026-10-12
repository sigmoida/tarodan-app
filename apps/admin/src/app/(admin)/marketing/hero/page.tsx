"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { HERO_MAX_SLIDES, HERO_PLACEMENTS } from "@tarodan/types";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { AdminTabs } from "@/components/AdminTabs";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { clientListFetcher } from "@/lib/query/client-list";
import { useTabParam } from "@/hooks/useTabParam";
import type { HeroPlacement, HeroSlide } from "./_lib/types";
import { HeroTable } from "./_components/HeroTable";
import { HeroSlideFormModal } from "./_modals/HeroSlideFormModal";

const DEFAULT_PLACEMENT: HeroPlacement = HERO_PLACEMENTS[0];

const isPlacement = (v: string): v is HeroPlacement =>
  (HERO_PLACEMENTS as readonly string[]).includes(v);

export default function HeroSlidesPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam(DEFAULT_PLACEMENT, { param: "placement" });
  const placement = isPlacement(tab) ? tab : DEFAULT_PLACEMENT;
  const [modal, setModal] = useState<{ slide?: HeroSlide } | null>(null);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.hero.title")}
        description={t("admin.marketing.hero.subtitle")}
      >
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            leftIcon={<PlusIcon className="h-5 w-5" />}
            onClick={() => setModal({})}
          >
            {t("admin.marketing.hero.new")}
          </Button>
          <p className="text-xs text-muted">
            {t("admin.marketing.hero.maxLiveNote", { max: HERO_MAX_SLIDES })}
          </p>
        </div>
      </PageHeader>

      <AdminTabs
        tabs={HERO_PLACEMENTS.map((p) => ({
          key: p,
          label: t(`admin.marketing.hero.placement.${p}`),
        }))}
        value={placement}
        onChange={setTab}
      />

      <ResourceList<HeroSlide>
        // Kapsam değişince liste yeniden kurulur (önbellek anahtarı da `scope`).
        key={placement}
        resource="hero-slides"
        // Full-load: yerleşim başına en fazla birkaç slayt; sıra sunucudan gelir.
        fetcher={clientListFetcher<HeroSlide>(
          () => adminApi.getHeroSlides({ placement }),
          (raw) => (Array.isArray(raw) ? raw : (raw?.data ?? [])),
        )}
        scope={{ placement }}
        limit={100}
        getRowId={(s) => s.id}
      >
        <HeroTable onEdit={(slide) => setModal({ slide })} />
      </ResourceList>

      {modal && (
        <HeroSlideFormModal
          key={modal.slide?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          slide={modal.slide}
          defaultPlacement={placement}
        />
      )}
    </AdminPage>
  );
}
