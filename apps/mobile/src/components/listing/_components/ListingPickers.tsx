import React from 'react';

import { PickerModal } from './PickerModal';
import { YEAR_OPTIONS } from '../_lib/constants';
import type { Category, Brand, CarModel, Manufacturer, MaterialOption } from '../_lib/types';
import type { ListingFormController } from '../_hooks/useListingForm';

/**
 * All picker/bottom-sheet modals for the listing form: category, brand, model,
 * material, manufacturer, year, and manufacturer-scoped attribute groups.
 */
export function ListingPickers({ f }: { f: ListingFormController }) {
  return (
    <>
      <PickerModal
        visible={f.showCategoryPicker}
        onClose={() => f.setShowCategoryPicker(false)}
        title="Kategori Seçin"
        data={f.flatCategories}
        onSelect={(item: Category) => f.setCategoryId(item.id)}
        selectedId={f.categoryId}
        searchValue={f.categorySearch}
        onSearchChange={f.setCategorySearch}
        keyExtractor={(item: Category) => item.id}
        labelExtractor={(item: Category) => item.name}
        emptyText="Kategori bulunamadı"
      />

      <PickerModal
        visible={f.showBrandPicker}
        onClose={() => f.setShowBrandPicker(false)}
        title="Marka Seçin"
        data={f.brands}
        onSelect={(item: Brand) => {
          f.setBrandId(item.id);
          f.setCarModelId('');
        }}
        selectedId={f.brandId}
        searchValue={f.brandSearch}
        onSearchChange={f.setBrandSearch}
        keyExtractor={(item: Brand) => item.id}
        labelExtractor={(item: Brand) => item.name}
        emptyText="Marka bulunamadı"
        loading={f.brandsLoading}
      />

      <PickerModal
        visible={f.showModelPicker}
        onClose={() => f.setShowModelPicker(false)}
        title="Model Seçin"
        data={f.models}
        onSelect={(item: CarModel) => f.setCarModelId(item.id)}
        selectedId={f.carModelId}
        keyExtractor={(item: CarModel) => item.id}
        labelExtractor={(item: CarModel) => item.name}
        emptyText="Model bulunamadı"
        loading={f.modelsLoading}
      />

      <PickerModal
        visible={f.showMaterialPicker}
        onClose={() => f.setShowMaterialPicker(false)}
        title="Malzeme Seçin"
        data={f.effectiveMaterials}
        onSelect={(item: MaterialOption) => f.setMaterial(item.slug)}
        selectedId={f.material}
        keyExtractor={(item: MaterialOption) => item.slug}
        labelExtractor={(item: MaterialOption) => item.label}
        emptyText="Malzeme bulunamadı"
      />

      <PickerModal
        visible={f.showManufacturerPicker}
        onClose={() => f.setShowManufacturerPicker(false)}
        title="Üretici Seçin"
        data={f.manufacturerList}
        onSelect={(item: Manufacturer) => f.setManufacturerId(item.id)}
        selectedId={f.manufacturerId}
        searchValue={f.manufacturerSearch}
        onSearchChange={f.setManufacturerSearch}
        keyExtractor={(item: Manufacturer) => item.id}
        labelExtractor={(item: Manufacturer) => item.name}
        emptyText="Üretici bulunamadı"
      />

      <PickerModal
        visible={f.showYearPicker}
        onClose={() => f.setShowYearPicker(false)}
        title="Yıl Seçin"
        data={YEAR_OPTIONS}
        onSelect={(item: number) => f.setYear(String(item))}
        selectedId={f.year}
        keyExtractor={(item: number) => String(item)}
        labelExtractor={(item: number) => String(item)}
        emptyText="Yıl bulunamadı"
      />

      {f.manufacturerAttrGroups.map((group) => {
        const selected = f.customAttributes[group.slug] ?? [];
        return (
          <PickerModal
            key={group.slug}
            modalKey={group.slug}
            visible={f.showAttrGroupPicker === group.slug}
            onClose={() => f.setShowAttrGroupPicker(null)}
            title={`${group.name} Seçin`}
            data={group.attributes}
            onSelect={(item: { slug: string; label: string }) => {
              f.setCustomAttributes((prev) => {
                const next = { ...prev };
                const current = next[group.slug] ?? [];
                if (current.length === 1 && current[0] === item.slug) {
                  delete next[group.slug];
                } else {
                  next[group.slug] = [item.slug];
                }
                return next;
              });
            }}
            selectedId={selected[0] ?? ''}
            keyExtractor={(item: { slug: string }) => item.slug}
            labelExtractor={(item: { label: string }) => item.label}
            emptyText="Sonuç bulunamadı"
          />
        );
      })}
    </>
  );
}
