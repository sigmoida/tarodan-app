/** @format */

"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useCollectionDetail } from "../_context/CollectionDetailContext";

export default function CollectionBreadcrumbs() {
  const { t, collection } = useCollectionDetail();

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center flex-wrap gap-y-1 text-sm text-muted overflow-x-auto whitespace-nowrap"
    >
      <Link
        href="/"
        className="hover:text-primary-500 transition-colors text-muted"
      >
        {t("common.home")}
      </Link>
      <ChevronRightIcon
        className="w-4 h-4 mx-1 flex-shrink-0 text-subtle"
        aria-hidden
      />
      <Link
        href="/collections"
        className="hover:text-primary-500 transition-colors text-muted"
      >
        {t("collection.collections")}
      </Link>
      {collection && (
        <>
          <ChevronRightIcon
            className="w-4 h-4 mx-1 flex-shrink-0 text-subtle"
            aria-hidden
          />
          <span className="text-subtle truncate max-w-[240px] font-medium text-heading">
            {collection.name}
          </span>
        </>
      )}
    </nav>
  );
}
