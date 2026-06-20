'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Input, Select } from '@tarodan/ui';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Brand {
  id: string;
  name: string;
}

interface CarModel {
  id: string;
  name: string;
  brandId: string;
}

interface AdminProductFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit?: () => void;
  status: string;
  onStatusChange: (v: string) => void;
  brandId: string;
  onBrandChange: (v: string) => void;
  carModelId: string;
  onCarModelChange: (v: string) => void;
  statusOptions: { value: string; label: string }[];
}

export function AdminProductFilters({
  search,
  onSearchChange,
  onSearchSubmit,
  status,
  onStatusChange,
  brandId,
  onBrandChange,
  carModelId,
  onCarModelChange,
  statusOptions,
}: AdminProductFiltersProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [allModels, setAllModels] = useState<CarModel[]>([]);

  useEffect(() => {
    adminApi.getBrands().then((r) => {
      setBrands(r.data?.data || r.data || []);
    }).catch(() => {});

    adminApi.getCarModels().then((r) => {
      setAllModels(r.data?.data || r.data || []);
    }).catch(() => {});
  }, []);

  const modelsForBrand = useMemo(
    () => (brandId ? allModels.filter((m) => m.brandId === brandId) : allModels),
    [allModels, brandId],
  );

  const handleBrandChange = (v: string) => {
    onBrandChange(v);
    onCarModelChange('');
  };

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row">
      {/* Arama — FilterToolbar ile aynı markup */}
      <div className="relative flex-1">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearchSubmit?.(); }}
          placeholder="Ürün veya satıcı ara..."
          className="pl-10"
        />
      </div>

      {/* Durum */}
      <Select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className="sm:w-48"
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </Select>

      {/* Marka */}
      <Select
        value={brandId}
        onChange={(e) => handleBrandChange(e.target.value)}
        className="sm:w-44"
      >
        <option value="">Tüm Markalar</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </Select>

      {/* Model — marka seçilince filtrelenir */}
      <Select
        value={carModelId}
        onChange={(e) => onCarModelChange(e.target.value)}
        className="sm:w-44"
        disabled={!brandId && modelsForBrand.length === 0}
      >
        <option value="">Tüm Modeller</option>
        {modelsForBrand.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </Select>
    </div>
  );
}
