/** @format */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Controller, useFormContext } from "react-hook-form";
import { Toggle } from "@tarodan/ui";
import { FormInput } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";

interface OptionsCardProps {
  locale: string;
  canTrade: boolean;
  /** Show the "Ön Sipariş" (preorder) toggle — edit form only. */
  showPreorder?: boolean;
}

/** "Seçenekler" — trade / (optional preorder) / set toggles + set size. Shared. */
export default function OptionsCard({
  canTrade,
  showPreorder = false,
}: OptionsCardProps) {
  const { watch } = useFormContext();
  const isSet = watch("isSet");
  const t = useTranslations();

  return (
    <SectionCard title={t("product.options")}>
      <div className="space-y-4">
        {/* Trade */}
        <div
          className={`flex items-center justify-between p-4 rounded-xl border ${
            canTrade
              ? "bg-success-50 border-success-200"
              : "bg-surface border-border"
          }`}
        >
          <div>
            <label className="font-medium text-heading">
              {t("product.tradeEnabled")}
            </label>
            <p className="text-sm text-muted">
              {canTrade
                ? t("product.tradeKeepsOpenForTrade")
                : t("product.tradeRequiresPremium")}
            </p>
          </div>
          {canTrade ? (
            <Controller
              name="isTradeEnabled"
              render={({ field }) => (
                <Toggle
                  checked={!!field.value}
                  onChange={field.onChange}
                  size="md"
                />
              )}
            />
          ) : (
            <Link
              href="/membership"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {t("product.upgradeArrow")}
            </Link>
          )}
        </div>

        {/* Preorder (edit only) */}
        {showPreorder && (
          <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
            <div>
              <label className="font-medium text-heading">
                {t("product.preorder")}
              </label>
              <p className="text-sm text-muted">
                {t("product.preorderHelper")}
              </p>
            </div>
            <Controller
              name="isPreorder"
              render={({ field }) => (
                <Toggle
                  checked={!!field.value}
                  onChange={field.onChange}
                  size="md"
                />
              )}
            />
          </div>
        )}

        {/* Set / bundle */}
        <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
          <div>
            <label className="font-medium text-heading">
              {t("product.setBundle")}
            </label>
            <p className="text-sm text-muted">{t("product.setBundleHelper")}</p>
          </div>
          <Controller
            name="isSet"
            render={({ field }) => (
              <Toggle
                checked={!!field.value}
                onChange={field.onChange}
                size="md"
              />
            )}
          />
        </div>

        {isSet && (
          <div className="p-4 bg-surface rounded-xl border border-border">
            <FormInput
              name="bundleSize"
              type="number"
              min={2}
              label={t("product.setPieceCount")}
              placeholder={t("product.setPiecePlaceholder")}
              helperText={t("product.setSizeHelper")}
            />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
