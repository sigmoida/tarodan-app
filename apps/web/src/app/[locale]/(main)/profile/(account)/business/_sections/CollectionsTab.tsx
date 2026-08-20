/** @format */

"use client";

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
        <p className="py-4 text-center text-muted">
          {t("page.business.collectionstab.henuzKoleksiyonIstatistigiYok")}
        </p>
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
