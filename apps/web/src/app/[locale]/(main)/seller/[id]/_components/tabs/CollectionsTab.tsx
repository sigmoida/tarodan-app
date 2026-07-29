/** @format */

"use client";

import { Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { EmptyStateCard } from "@/components/ui";
import CollectionCard from "../../../../(catalog)/collections/_components/CollectionCard";
import type { Seller, SellerCollection } from "../../_lib/types";

interface CollectionsTabProps {
  collections: SellerCollection[];
  loading: boolean;
  seller: Seller;
}

export default function CollectionsTab({
  collections,
  loading,
  seller,
}: CollectionsTabProps) {
  const t = useTranslations();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }
  if (collections.length === 0) {
    return (
      <EmptyStateCard
        title={t("seller.noCollections")}
        description={t("seller.noCollectionsDesc")}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {collections.map((collection) => (
        <CollectionCard
          key={collection.id}
          collection={{
            ...collection,
            isPublic: true,
            userId: seller.id,
            userName: seller.displayName,
          }}
        />
      ))}
    </div>
  );
}
