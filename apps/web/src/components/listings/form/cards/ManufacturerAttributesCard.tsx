/** @format */

"use client";

import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button, Select } from "@tarodan/ui";
import SectionCard from "@/components/ui/SectionCard";

interface ManufacturerAttributeGroup {
  slug: string;
  name: string;
  attributes: Array<{ slug: string; label: string; color?: string | null }>;
}

interface ManufacturerAttributesCardProps {
  manufacturerList: Array<{ id: string; name: string }>;
  manufacturerAttrGroups: ManufacturerAttributeGroup[];
}

/**
 * Üreticiye özel nitelikler (ör. Hot Wheels serisi/nadirlik).
 *
 * Context yerine props alır: yeni ilan ve düzenleme formlarının ikisi de aynı
 * bölümü gösterir, ikisi de kendi veri kaynağından besler.
 */
export default function ManufacturerAttributesCard({
  manufacturerList,
  manufacturerAttrGroups,
}: ManufacturerAttributesCardProps) {
  const t = useTranslations();
  const { watch, setValue } = useFormContext();
  const manufacturerId = watch("manufacturerId");
  const customAttributes: Record<string, string[]> =
    watch("customAttributes") ?? {};

  if (manufacturerAttrGroups.length === 0) return null;

  const manufacturerName = manufacturerList.find(
    (m) => m.id === manufacturerId,
  )?.name;

  const setGroup = (slug: string, values: string[]) => {
    const next = { ...customAttributes };
    if (values.length === 0) delete next[slug];
    else next[slug] = values;
    setValue("customAttributes", next);
  };

  return (
    <SectionCard
      title={`${manufacturerName ?? ""} ${t("product.detailsSuffix")}`}
    >
      <p className="text-xs text-muted -mt-2 mb-4">
        {t("product.manufacturerAttrsHint")}
      </p>
      <div className="space-y-4">
        {manufacturerAttrGroups.map((group) => {
          const selected = customAttributes[group.slug] ?? [];
          const isLong = group.attributes.length > 20;
          return (
            <div key={group.slug}>
              <label className="block text-sm font-medium text-body mb-1">
                {group.name}
                {selected.length > 0 && (
                  <span className="ml-2 text-xs text-muted">
                    ({selected.length})
                  </span>
                )}
              </label>
              {isLong ? (
                <Select
                  value={selected[0] ?? ""}
                  onChange={(e) =>
                    setGroup(group.slug, e.target.value ? [e.target.value] : [])
                  }
                  placeholder={t("product.selectAttribute", {
                    name: group.name,
                  })}
                  options={group.attributes.map((a) => ({
                    value: a.slug,
                    label: a.label,
                  }))}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {group.attributes.map((a) => {
                    const isSelected = selected.includes(a.slug);
                    return (
                      <Button
                        key={a.slug}
                        variant="secondary"
                        type="button"
                        onClick={() =>
                          setGroup(
                            group.slug,
                            isSelected
                              ? selected.filter((s) => s !== a.slug)
                              : [...selected, a.slug],
                          )
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${
                          isSelected
                            ? "bg-primary-500 text-inverted border-primary-500"
                            : "bg-surface text-body border-border-subtle hover:bg-surface-alt"
                        }`}
                      >
                        {a.color && (
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-border-subtle"
                            style={{ backgroundColor: a.color }}
                            aria-hidden="true"
                          />
                        )}
                        {a.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
