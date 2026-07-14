import Image from "next/image";
import { Badge } from "@tarodan/ui";
import { col, TruncatedText } from "@/components/table";
import { collectionRowMenu, type CollectionRowActions } from "./rowActions";
import type { Collection } from "./types";

export function collectionColumns(actions: CollectionRowActions) {
  return [
    col.custom<Collection>(
      "Koleksiyon",
      (c) => (
        <div className="flex min-w-0 items-center gap-3">
          {c.coverImageUrl ? (
            <Image
              src={c.coverImageUrl}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 flex-shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-surface-alt text-xs text-muted">
              N/A
            </div>
          )}
          <div className="min-w-0">
            <TruncatedText className="font-medium text-heading">
              {c.name}
            </TruncatedText>
            {c.description && (
              <TruncatedText className="text-xs text-muted">
                {c.description}
              </TruncatedText>
            )}
          </div>
        </div>
      ),
      { grow: 3, minWidth: 220 },
    ),
    col.custom<Collection>("Sahibi", (c) => {
      const tier = c.owner?.membershipTier;
      return (
        <div className="flex min-w-0 items-center gap-2">
          <TruncatedText className="text-body">
            {c.owner?.displayName}
          </TruncatedText>
          {(tier === "premium" || tier === "business") && (
            <Badge size="sm" variant={tier === "business" ? "info" : "warning"}>
              {tier === "business" ? "İş" : "Premium"}
            </Badge>
          )}
        </div>
      );
    }),
    col.number<Collection>("Ürün", (c) => c.itemCount),
    col.number<Collection>("Görüntüleme", (c) => c.viewCount),
    col.number<Collection>("Beğeni", (c) => c.likeCount),
    col.badge<Collection>("Durum", (c) => (
      <Badge active={c.isPublic} activeLabel="Görünür" passiveLabel="Gizli" />
    )),
    col.rowMenu<Collection>(collectionRowMenu(actions)),
  ];
}
