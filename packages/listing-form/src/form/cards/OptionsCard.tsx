/** @format */

"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Controller, useFormContext } from "react-hook-form";
import { Toggle } from "@tarodan/ui";
import { FormInput } from "@tarodan/ui/form";
import SectionCard from "@tarodan/ui/section-card";

// Set / Paket (bundle) is temporarily disabled and hidden from the form.
// Flip to `true` to bring the toggle + piece-count input back.
const SET_BUNDLE_ENABLED: boolean = false;

interface OptionsCardProps {
  locale: string;
  canTrade: boolean;
  /** Show the "Ön Sipariş" (preorder) toggle — edit form only. */
  showPreorder?: boolean;
  /**
   * Takas hakkı olmayan satıcıya gösterilen yükseltme bağlantısı. Hedef sayfa
   * uygulamaya göre değişir (vitrinde `/membership`, yönetici panelinde yok),
   * bu yüzden kart onu üretmez — çağıran verir, vermezse hiç çıkmaz.
   */
  upgradeLink?: ReactNode;
}

/** "Seçenekler" — trade / (optional preorder) / set toggles + set size. Shared. */
export default function OptionsCard({
  canTrade,
  showPreorder = false,
  upgradeLink = null,
}: OptionsCardProps) {
  const { watch } = useFormContext();
  const isSet = watch("isSet");
  const t = useTranslations();

  return (
    <SectionCard title={t("product.options")}>
      <div className="space-y-4">
        {/* Trade */}
        <div className="flex items-center justify-between p-4 rounded-xl border bg-surface border-border">
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
            // Takas hakkı yoksa gösterilen yükseltme bağlantısı UYGULAMAYA
            // aittir: vitrinde `/membership` var, yönetici panelinde yok.
            // Kart onu render etmez, çağıran verir.
            upgradeLink
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

        {/* Set / bundle — temporarily disabled (see SET_BUNDLE_ENABLED). */}
        {SET_BUNDLE_ENABLED && (
          <>
            <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
              <div>
                <label className="font-medium text-heading">
                  {t("product.setBundle")}
                </label>
                <p className="text-sm text-muted">
                  {t("product.setBundleHelper")}
                </p>
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
          </>
        )}
      </div>
    </SectionCard>
  );
}
