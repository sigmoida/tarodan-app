import type { Dispatch, SetStateAction } from 'react';
import { Input, Select, Textarea } from '@tarodan/ui';
import { SimpleDropdown } from '../../../_components/SimpleDropdown';
import { CONDITIONS } from '../_lib/constants';
import type { Brand, CarModel, Category, EditListingFormData } from '../_lib/types';

interface BasicInfoSectionProps {
  formData: EditListingFormData;
  setFormData: Dispatch<SetStateAction<EditListingFormData>>;
  flatCategories: Category[];
  brands: Brand[];
  brandsLoading: boolean;
  models: CarModel[];
  modelsLoading: boolean;
  scaleList: string[];
  materialList: Array<{ slug: string; label: string }>;
  manufacturerList: Array<{ id: string; name: string; slug: string }>;
  yearOptions: number[];
}

export default function BasicInfoSection({
  formData,
  setFormData,
  flatCategories,
  brands,
  brandsLoading,
  models,
  modelsLoading,
  scaleList,
  materialList,
  manufacturerList,
  yearOptions,
}: BasicInfoSectionProps) {
  return (
    <>
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-body mb-2">
          Başlık <span className="text-danger-500">*</span>
        </label>
        <Input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="h-12 px-4 rounded-xl"
          placeholder="Örn: Hot Wheels '69 Camaro Z28"
          required
          minLength={5}
          maxLength={200}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-body mb-2">
          Açıklama
        </label>
        <Textarea value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="px-4 py-3 rounded-xl text-heading placeholder-muted"
          placeholder="Ürün hakkında detaylı bilgi..."
          rows={5}
          maxLength={5000} />
      </div>

      {/* Category & Condition */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-body mb-2">
            Kategori <span className="text-danger-500">*</span>
          </label>
          <Select
            value={formData.categoryId}
            onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            className="rounded-xl"
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
          <label className="block text-sm font-medium text-body mb-2">
            Durum <span className="text-danger-500">*</span>
          </label>
          <Select
            value={formData.condition}
            onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
            className="rounded-xl"
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

      {/* Brand & Scale */}
      <div className="grid md:grid-cols-2 gap-6">
        <SimpleDropdown
          label="Marka"
          value={formData.brandId}
          onValueChange={(newBrandId) =>
            setFormData((prev) => ({ ...prev, brandId: newBrandId, carModelId: '' }))
          }
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          placeholder={brandsLoading ? 'Yükleniyor...' : 'Marka Seçin'}
          disabled={brandsLoading}
          triggerClassName="py-3 rounded-xl border-border"
        />

        <SimpleDropdown
          label="Model"
          value={formData.carModelId}
          onValueChange={(carModelId) => setFormData({ ...formData, carModelId })}
          options={models.map((m) => ({ value: m.id, label: m.name }))}
          placeholder={
            !formData.brandId
              ? 'Önce marka seçin'
              : modelsLoading
                ? 'Yükleniyor...'
                : models.length === 0
                  ? 'Bu markaya ait model yok'
                  : 'Model Seçin'
          }
          disabled={!formData.brandId || modelsLoading}
          triggerClassName="py-3 rounded-xl border-border"
        />

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            Ölçek
          </label>
          <Select
            value={formData.scale}
            onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
            className="rounded-xl"
          >
            {(scaleList.length > 0 ? scaleList : ['1:18', '1:24', '1:43', '1:64', '1:87']).map((scale) => (
              <option key={scale} value={scale}>
                {scale}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            Malzeme
          </label>
          <Select
            value={formData.material}
            onChange={(e) => setFormData({ ...formData, material: e.target.value })}
            className="rounded-xl"
          >
            <option value="">Malzeme seçin</option>
            {(materialList.length > 0 ? materialList : [
              { slug: 'diecast', label: 'Diecast (Metal)' },
              { slug: 'resin', label: 'Resin (Reçine)' },
              { slug: 'composite', label: 'Composite (Kompozit)' },
              { slug: 'plastic', label: 'Plastic (Plastik)' },
            ]).map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            Üretici
          </label>
          <Select
            value={formData.manufacturerId}
            onChange={(e) => setFormData({ ...formData, manufacturerId: e.target.value })}
            className="rounded-xl"
          >
            <option value="">Üretici seçin</option>
            {manufacturerList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            Çıkış yılı
          </label>
          <p className="text-xs text-muted mb-2">Modelin çıkış yılı (isteğe bağlı)</p>
          <Select
            value={formData.year}
            onChange={(e) => setFormData({ ...formData, year: e.target.value })}
            className="rounded-xl"
          >
            <option value="">Yıl seçin</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </>
  );
}
