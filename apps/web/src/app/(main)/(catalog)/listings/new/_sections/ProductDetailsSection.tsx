/** @format */

"use client";

import { Select } from "@tarodan/ui";
import { SimpleDropdown } from "../../_components/SimpleDropdown";
import { FormSection } from "./FormSection";
import { useNewListing } from "../_context/NewListingContext";

const FALLBACK_SCALES = ["1:18", "1:24", "1:43", "1:64", "1:87"];
const FALLBACK_MATERIALS = [
  { slug: "diecast", label: "Diecast (Metal)" },
  { slug: "resin", label: "Resin (Reçine)" },
  { slug: "composite", label: "Composite (Kompozit)" },
  { slug: "plastic", label: "Plastic (Plastik)" },
];

export default function ProductDetailsSection() {
  const {
    locale,
    formData,
    setFormData,
    CONDITIONS,
    flatCategories,
    brands,
    brandsLoading,
    models,
    modelsLoading,
    scaleList,
    materialList,
    manufacturerList,
    yearOptions,
  } = useNewListing();

  return (
    <FormSection title="Ürün Detayları">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            Ürün Tipi <span className="text-danger-500">*</span>
          </label>
          <Select
            value={formData.categoryId}
            onChange={(e) =>
              setFormData({ ...formData, categoryId: e.target.value })
            }
            required
          >
            <option value="">Kategori Seçin</option>
            {flatCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            Ürün Durumu <span className="text-danger-500">*</span>
          </label>
          <Select
            value={formData.condition}
            onChange={(e) =>
              setFormData({ ...formData, condition: e.target.value })
            }
            required
          >
            {CONDITIONS.map((cond) => (
              <option key={cond.value} value={cond.value}>
                {cond.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <SimpleDropdown
          label="Marka"
          value={formData.brandId}
          onValueChange={(newBrandId) =>
            setFormData((prev) => ({ ...prev, brandId: newBrandId, carModelId: "" }))
          }
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          placeholder={brandsLoading ? "Yükleniyor..." : "Marka Seçin"}
          disabled={brandsLoading}
        />

        <SimpleDropdown
          label="Model"
          value={formData.carModelId}
          onValueChange={(carModelId) =>
            setFormData({ ...formData, carModelId })
          }
          options={models.map((m) => ({ value: m.id, label: m.name }))}
          placeholder={
            !formData.brandId
              ? "Önce marka seçin"
              : modelsLoading
                ? "Yükleniyor..."
                : models.length === 0
                  ? "Bu markaya ait model yok"
                  : "Model Seçin"
          }
          disabled={!formData.brandId || modelsLoading}
        />

        <div>
          <label className="block text-sm font-medium text-body mb-1">Ölçek</label>
          <Select
            value={formData.scale}
            onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
          >
            {(scaleList.length > 0 ? scaleList : FALLBACK_SCALES).map((scale) => (
              <option key={scale} value={scale}>
                {scale}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {locale === "en" ? "Material" : "Malzeme"}
          </label>
          <Select
            value={formData.material}
            onChange={(e) =>
              setFormData({ ...formData, material: e.target.value })
            }
          >
            <option value="">
              {locale === "en" ? "Select material" : "Malzeme seçin"}
            </option>
            {(materialList.length > 0 ? materialList : FALLBACK_MATERIALS).map(
              (m) => (
                <option key={m.slug} value={m.slug}>
                  {m.label}
                </option>
              ),
            )}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {locale === "en" ? "Manufacturer" : "Üretici"}
          </label>
          <Select
            value={formData.manufacturerId}
            onChange={(e) =>
              setFormData({ ...formData, manufacturerId: e.target.value })
            }
          >
            <option value="">
              {locale === "en" ? "Select manufacturer" : "Üretici seçin"}
            </option>
            {manufacturerList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {locale === "en" ? "Release year" : "Çıkış yılı"}
          </label>
          <Select
            value={formData.year}
            onChange={(e) => setFormData({ ...formData, year: e.target.value })}
          >
            <option value="">
              {locale === "en" ? "Select year" : "Yıl seçin"}
            </option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </FormSection>
  );
}
