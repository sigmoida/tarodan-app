/** @format */

import { RectangleStackIcon } from "@heroicons/react/24/outline";
import SectionCard from "@/components/ui/SectionCard";
import CollectionRow from "../_components/CollectionRow";
import type { CollectionStats } from "../_lib/types";

export default function CollectionsTab({
  collections,
}: {
  collections: CollectionStats[];
}) {
  return (
    <SectionCard
      title="En Popüler Koleksiyonlar"
      badge={<RectangleStackIcon className="h-5 w-5 text-primary-600" />}
    >
      {collections.length === 0 ? (
        <p className="py-4 text-center text-muted">
          Henüz koleksiyon istatistiği yok
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
