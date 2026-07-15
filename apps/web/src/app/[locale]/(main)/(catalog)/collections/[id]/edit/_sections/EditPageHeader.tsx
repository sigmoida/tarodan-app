"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";

interface EditPageHeaderProps {
  onBack: () => void;
}

export default function EditPageHeader({ onBack }: EditPageHeaderProps) {
  const t = useTranslations();

  return (
    <div className="bg-surface-elevated border-b border-border">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-4">
        <Button
          variant="secondary"
          onClick={onBack}
          className="flex items-center gap-2 text-muted hover:text-body text-sm transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {t("common.back")}
        </Button>
        <h1 className="text-xl font-bold text-heading flex items-center gap-2">
          <div className="w-1 h-6 bg-primary-500 rounded-sm" />
          {t("collection.editCollectionTitle")}
        </h1>
      </div>
    </div>
  );
}
