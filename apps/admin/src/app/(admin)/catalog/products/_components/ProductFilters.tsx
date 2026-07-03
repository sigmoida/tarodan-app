'use client';

import { useQuery } from '@tanstack/react-query';
import { Select } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { ResourceList, useFilter } from '@/components/list';
import { productStatusOptions } from '../_lib/types';

interface Brand {
  id: string;
  name: string;
}
interface CarModel {
  id: string;
  name: string;
  brandId: string;
}

/** Product list filters: status (static) + brand/model (dynamic, dependent). */
export function ProductFilters() {
  const [brandId, setBrandId] = useFilter('brandId');
  const [carModelId, setCarModelId] = useFilter('carModelId');

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['brands', 'options'],
    queryFn: async () => (await adminApi.getBrands()).data?.data ?? [],
  });
  const { data: models = [] } = useQuery<CarModel[]>({
    queryKey: ['car-models', 'options'],
    queryFn: async () => (await adminApi.getCarModels()).data?.data ?? [],
  });

  const modelsForBrand = brandId ? models.filter((m) => m.brandId === brandId) : models;

  return (
    <>
      <ResourceList.FilterSelect name="status" options={productStatusOptions} className="sm:w-48" />
      <Select
        bare
        value={brandId}
        onChange={(e) => {
          setBrandId(e.target.value);
          setCarModelId('');
        }}
        className="w-full sm:w-44"
      >
        <option value="">Tüm Markalar</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select
        bare
        value={carModelId}
        onChange={(e) => setCarModelId(e.target.value)}
        className="w-full sm:w-44"
        disabled={!brandId && modelsForBrand.length === 0}
      >
        <option value="">Tüm Modeller</option>
        {modelsForBrand.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
    </>
  );
}
