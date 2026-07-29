/** @format */

"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Button, Input, Select, IconButton } from "@tarodan/ui";
import { useCollections } from "../_context/CollectionsContext";
import { type SortOption } from "../_lib/data";

export default function CollectionsToolbar() {
  const t = useTranslations();
  const {
    mounted,
    isAuthenticated,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    categoryId,
    setCategoryFilter,
    flatCategories,
    myCollections,
  } = useCollections();

  return (
    <>
      {/* Tabs */}
      {mounted && isAuthenticated && (
        <div className="flex gap-1 mb-5 bg-surface-alt rounded-lg p-1 w-fit">
          <Button
            variant="secondary"
            onClick={() => {
              setActiveTab("public");
              setSearchQuery("");
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "public"
                ? "bg-surface-elevated text-heading shadow-sm"
                : "text-muted hover:text-body"
            }`}
          >
            {t("collection.isPublic")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setActiveTab("mine");
              setSearchQuery("");
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "mine"
                ? "bg-surface-elevated text-heading shadow-sm"
                : "text-muted hover:text-body"
            }`}
          >
            {t("collection.myCollections")} ({myCollections.length})
          </Button>
        </div>
      )}

      {/* Search & Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1">
          <Input
            type="text"
            placeholder={t("collection.searchCollections")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftAdornment={<MagnifyingGlassIcon className="h-4 w-4" />}
            rightAdornment={
              searchQuery ? (
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label={t("common.clear")}
                  onClick={() => setSearchQuery("")}
                >
                  <XMarkIcon className="h-4 w-4" />
                </IconButton>
              ) : undefined
            }
          />
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "public" && (
            <Select
              value={categoryId}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-auto min-w-[140px] whitespace-nowrap"
            >
              <option value="">{t("product.allCategories")}</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </Select>
          )}
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="w-auto min-w-[140px] whitespace-nowrap"
          >
            <option value="popular">{t("common.popular")}</option>
            <option value="recent">{t("common.newest")}</option>
            <option value="name">A-Z</option>
            <option value="items_desc">{t("common.desc")}</option>
            <option value="items_asc">{t("common.asc")}</option>
          </Select>
        </div>
      </div>
    </>
  );
}
