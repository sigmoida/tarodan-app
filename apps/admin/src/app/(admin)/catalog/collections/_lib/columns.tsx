import Image from "next/image";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, TruncatedText } from "@/components/table";
import { collectionRowMenu, type CollectionRowActions } from "./rowActions";
import type { Collection } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function collectionColumns(t: T, actions: CollectionRowActions) {
  return [
    col.custom<Collection>(
      t("admin.catalog.common.collection"),
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
      {
        minWidth: 360,
        sortKey: "name",
        sortType: "text",
      },
    ),
    col.user<Collection>(
      t("admin.catalog.collections.owner"),
      (c) => ({
        name: c.owner.displayName,
        secondary: c.owner.email,
        avatar: c.owner.avatarUrl,
        href: `/accounts/users/${c.owner.id}`,
        tertiary:
          c.owner.membershipTier === "premium" ||
          c.owner.membershipTier === "business" ? (
            <div className="mt-1">
              <Badge
                size="sm"
                variant={
                  c.owner.membershipTier === "business" ? "info" : "warning"
                }
              >
                {c.owner.membershipTier === "business"
                  ? t("admin.catalog.collections.tierBusiness")
                  : t("admin.catalog.collections.tierPremium")}
              </Badge>
            </div>
          ) : undefined,
      }),
      { minWidth: 360, sortKey: "owner.displayName", sortType: "text" },
    ),
    col.number<Collection>(
      t("admin.catalog.common.product"),
      (c) => c.itemCount,
      { sortKey: "itemCount" },
    ),
    col.number<Collection>(t("admin.catalog.common.views"), "viewCount"),
    col.number<Collection>(
      t("admin.catalog.collections.likes"),
      (c) => c.likeCount,
      { sortKey: "likeCount", sortType: "number" },
    ),
    col.badge<Collection>(
      t("common.status"),
      (c) => (
        <Badge
          active={c.isPublic}
          activeLabel={t("admin.catalog.collections.visible")}
          passiveLabel={t("admin.catalog.collections.hidden")}
        />
      ),
      { sortKey: "isPublic" },
    ),
    col.rowMenu<Collection>(collectionRowMenu(t, actions)),
  ];
}
