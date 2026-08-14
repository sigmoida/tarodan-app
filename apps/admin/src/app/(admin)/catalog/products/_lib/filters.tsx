import { Select } from "@tarodan/ui";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { getProductStatusOptions } from "./types";

interface Brand {
  id: string;
  name: string;
}
interface CarModel extends Brand {
  brandId: string;
}

/**
 * Brand and model are `custom` rows rather than plain selects because they are
 * dependent: the model list narrows to the brand *currently in the draft*, and
 * changing the brand clears the model. Both read and write the same draft, so
 * the dependency survives without either committing to the list early.
 *
 * They stay two rows (not one) so the badge counts them as two filters.
 */
export const productFilterFields = (
  t: TranslateFn,
  brands: Brand[],
  models: CarModel[],
): FilterField[] => [
  {
    type: "select",
    name: "status",
    label: t("common.status"),
    options: getProductStatusOptions(t),
  },
  {
    type: "custom",
    names: ["brandId"],
    label: t("admin.shared.filterDialog.labels.brand"),
    render: (draft) => (
      <Select
        label={t("admin.shared.filterDialog.labels.brand")}
        value={draft.values.brandId ?? ""}
        // Clearing the model in the same patch keeps the pair consistent —
        // a model from the previous brand would otherwise survive.
        onChange={(event) =>
          draft.set({ brandId: event.target.value, carModelId: "" })
        }
        options={[
          { value: "", label: t("admin.catalog.brands.allBrands") },
          ...brands.map((b) => ({ value: b.id, label: b.name })),
        ]}
      />
    ),
  },
  {
    type: "custom",
    names: ["carModelId"],
    label: t("admin.shared.filterDialog.labels.carModel"),
    render: (draft) => {
      const brandId = draft.values.brandId ?? "";
      const forBrand = brandId
        ? models.filter((m) => m.brandId === brandId)
        : models;
      return (
        <Select
          label={t("admin.shared.filterDialog.labels.carModel")}
          value={draft.values.carModelId ?? ""}
          onChange={(event) => draft.set({ carModelId: event.target.value })}
          disabled={forBrand.length === 0}
          options={[
            { value: "", label: t("admin.catalog.common.allModels") },
            ...forBrand.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
      );
    },
  },
  { type: "dateRange", label: t("admin.shared.filterDialog.labels.dateRange") },
];
