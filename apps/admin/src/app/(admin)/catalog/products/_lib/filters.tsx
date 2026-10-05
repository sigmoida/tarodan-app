import { Select } from "@tarodan/ui";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { fieldKeys } from "@/components/list/filters/schema";
import {
  removalActorFilterOptions,
  removalReasonFilterOptions,
} from "@/lib/listing-removal";

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
  // Kaldırma nedeni / kaldıran: ilk seçenek nötr (boş) — liste süzülmüş açılmaz.
  {
    type: "select",
    name: "removalReason",
    label: t("admin.catalog.products.removal.reasonFilter"),
    options: removalReasonFilterOptions(t),
  },
  {
    type: "select",
    name: "removalActor",
    label: t("admin.catalog.products.removal.actorFilter"),
    options: removalActorFilterOptions(t),
  },
  { type: "dateRange", label: t("admin.shared.filterDialog.labels.dateRange") },
];

/** Diyalogda alanı olmayan, derin bağlantıyla gelen filtre (satıcı detayından). */
export const PRODUCT_DEEP_LINK_FILTER_KEYS = ["sellerId"] as const;

/**
 * Ürün listesinin TÜM filtre anahtarları — diyalog alanlarından türetilir, ayrı
 * bir liste tutulmaz. Başlıktaki toplam ve tablonun "filtreli" boş durumu bunu
 * okur: listeye yeni bir filtre eklenince ikisi de onu kendiliğinden görür.
 * Seçenek listeleri anahtarları etkilemediği için boş marka/model verilir.
 */
export function productFilterKeys(t: TranslateFn): string[] {
  return [
    ...PRODUCT_DEEP_LINK_FILTER_KEYS,
    ...productFilterFields(t, [], []).flatMap(fieldKeys),
  ];
}
