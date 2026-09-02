/** @format */

"use client";

import { useController } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button, Select } from "@tarodan/ui";

/**
 * Özel grup alanının ortak parçaları — genel grup kartı (tek seçim) ile
 * üretici kartı (çip/tek seçim) aynı form bağını ve hata gösterimini
 * paylaşır; ikisi yalnız hangi denetimi çizeceğine karar verir.
 */

export interface AttributeGroupOption {
  slug: string;
  label: string;
  color?: string | null;
}

export interface AttributeGroupFieldGroup {
  slug: string;
  name: string;
  attributes: AttributeGroupOption[];
}

/**
 * `customAttributes.<slug>` bağı. Temizlemede `[]` yazılır, asla `undefined`:
 * şemadaki `z.record` `undefined` değeri reddeder. `field.onChange` formu
 * kirli işaretler ve alan bazında doğrular — seçim yapılınca o grubun
 * zorunlu hatası kalkar, başka bir grubu erkenden kızartmaz.
 */
export function useAttributeGroupField(groupSlug: string) {
  const { field, fieldState } = useController({
    name: `customAttributes.${groupSlug}`,
    // Kayıt anında `undefined` yazılmasın: `z.record` değeri reddeder ve
    // seçim yapılmamış İSTEĞE BAĞLI bir grup bile gönderimi düşürürdü.
    defaultValue: [],
  });
  const selected: string[] = Array.isArray(field.value) ? field.value : [];
  return {
    selected,
    setSelected: (next: string[]) => field.onChange(next),
    error: fieldState.error?.message as string | undefined,
  };
}

export function AttributeGroupLabel({
  name,
  required,
  count,
}: {
  name: string;
  required?: boolean;
  count?: number;
}) {
  const t = useTranslations();
  return (
    <label className="block text-sm font-medium text-body mb-1">
      {required ? t("product.requiredFieldLabel", { name }) : name}
      {count != null && count > 0 && (
        <span className="ml-2 text-xs text-muted">({count})</span>
      )}
    </label>
  );
}

/**
 * Tek seçimli açılır liste — genel özel gruplar ve uzun üretici grupları.
 * `required` yıldızı çağıran verir: yalnız şemanın/API'nin gerçekten
 * zorladığı gruplar (genel özel) işaretlenir.
 */
export function AttributeGroupSelect({
  group,
  placeholder,
  disabled,
  required,
}: {
  group: AttributeGroupFieldGroup;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const { selected, setSelected, error } = useAttributeGroupField(group.slug);
  return (
    <div>
      <AttributeGroupLabel name={group.name} required={required} />
      <Select
        value={selected[0] ?? ""}
        onChange={(e) => setSelected(e.target.value ? [e.target.value] : [])}
        placeholder={placeholder}
        disabled={disabled}
        error={error}
        options={group.attributes.map((a) => ({
          value: a.slug,
          label: a.label,
        }))}
      />
    </div>
  );
}

/** Çoklu seçimli çipler — kısa üretici grupları. */
export function AttributeGroupChips({
  group,
  required,
}: {
  group: AttributeGroupFieldGroup;
  required?: boolean;
}) {
  const { selected, setSelected, error } = useAttributeGroupField(group.slug);
  return (
    <div>
      <AttributeGroupLabel
        name={group.name}
        required={required}
        count={selected.length}
      />
      <div className="flex flex-wrap gap-2">
        {group.attributes.map((a) => {
          const isSelected = selected.includes(a.slug);
          return (
            <Button
              key={a.slug}
              variant="secondary"
              type="button"
              onClick={() =>
                setSelected(
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
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
