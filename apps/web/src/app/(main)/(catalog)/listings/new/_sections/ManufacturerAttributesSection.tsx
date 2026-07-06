/** @format */

"use client";

import { Button, Select } from "@tarodan/ui";
import { FormSection } from "./FormSection";
import { useNewListing } from "../_context/NewListingContext";

export default function ManufacturerAttributesSection() {
  const { locale, formData, setFormData, manufacturerList, manufacturerAttrGroups } =
    useNewListing();

  if (manufacturerAttrGroups.length === 0) return null;

  const manufacturerName = manufacturerList.find(
    (m) => m.id === formData.manufacturerId,
  )?.name;

  return (
    <FormSection
      title={`${manufacturerName ?? ""} ${locale === "en" ? "details" : "detayları"}`}
    >
      <p className="text-xs text-muted -mt-2 mb-4">
        {locale === "en"
          ? "Optional fields specific to this manufacturer. Buyers can filter by these."
          : "Bu üreticiye özgü opsiyonel alanlar. Alıcılar bunlara göre filtreleyebilir."}
      </p>
      <div className="space-y-4">
        {manufacturerAttrGroups.map((group) => {
          const selected = formData.customAttributes[group.slug] ?? [];
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
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => {
                      const next = { ...prev.customAttributes };
                      if (!value) delete next[group.slug];
                      else next[group.slug] = [value];
                      return { ...prev, customAttributes: next };
                    });
                  }}
                >
                  <option value="">
                    {locale === "en"
                      ? `Select ${group.name.toLowerCase()}`
                      : `${group.name} seçin`}
                  </option>
                  {group.attributes.map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {group.attributes.map((a) => {
                    const isSelected = selected.includes(a.slug);
                    return (
                      <Button
                        key={a.slug}
                        variant="secondary"
                        type="button"
                        onClick={() => {
                          setFormData((prev) => {
                            const current = prev.customAttributes[group.slug] ?? [];
                            const nextArr = current.includes(a.slug)
                              ? current.filter((s) => s !== a.slug)
                              : [...current, a.slug];
                            const map = { ...prev.customAttributes };
                            if (nextArr.length === 0) delete map[group.slug];
                            else map[group.slug] = nextArr;
                            return { ...prev, customAttributes: map };
                          });
                        }}
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
    </FormSection>
  );
}
