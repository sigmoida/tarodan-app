/** @format */

"use client";

import { ChartBarIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "@tarodan/ui";
import SectionCard from "@/components/ui/SectionCard";
import CollectionRow from "../_components/CollectionRow";
import type { CollectionStats } from "../_lib/types";
import { useTranslations } from "next-intl";

export default function CollectionsTab({
  collections,
}: {
  collections: CollectionStats[];
}) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("page.business.collectionstab.enPopulerKoleksiyonlar")}
    >
      {collections.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<ChartBarIcon className="h-6 w-6" />}
          title={t(
            "page.business.collectionstab.henuzKoleksiyonIstatistigiYok",
          )}
        />
      ) : (
        <div className="space-y-3">
          {collections.map((collection, index) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              index={index}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
