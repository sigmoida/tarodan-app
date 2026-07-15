/** @format */

import { Link } from "@/i18n/navigation";
import OptimizedImage from "@/components/OptimizedImage";
import { BookOpenIcon, EyeIcon, HeartIcon } from "@heroicons/react/24/outline";
import type { CollectionStats } from "../_lib/types";

export default function CollectionRow({
  collection,
  index,
}: {
  collection: CollectionStats;
  index: number;
}) {
  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-surface"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt text-sm font-bold text-muted">
        {index + 1}
      </div>
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
        {collection.coverImage ? (
          <OptimizedImage
            src={collection.coverImage}
            alt={collection.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <BookOpenIcon className="h-6 w-6 text-subtle" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-heading transition-colors group-hover:text-primary-600">
          {collection.name}
        </p>
        <p className="text-sm text-muted">{collection.itemCount} ürün</p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-info-600">
          <EyeIcon className="h-4 w-4" />
          {collection.viewCount.toLocaleString("tr-TR")}
        </span>
        <span className="flex items-center gap-1 text-danger-600">
          <HeartIcon className="h-4 w-4" />
          {collection.likeCount.toLocaleString("tr-TR")}
        </span>
      </div>
    </Link>
  );
}
