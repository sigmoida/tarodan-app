/** @format */

'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { Select } from '@tarodan/ui';
import { FormSelect } from '@tarodan/ui/form';
import { SectionCard } from '@/components/ui';
import {
	FALLBACK_MATERIALS,
	FALLBACK_SCALES,
	type Brand,
	type CarModel,
	type Category,
	type Ref,
} from '../constants';

interface ProductDetailsCardProps {
	locale: string;
	conditions: Array<{ value: string; label: string }>;
	flatCategories: Category[];
	brands: Brand[];
	brandsLoading: boolean;
	models: CarModel[];
	modelsLoading: boolean;
	scaleList: string[];
	materialList: Array<{ slug: string; label: string }>;
	manufacturerList: Ref[];
	yearOptions: number[];
}

/** "Ürün Detayları" — the category/condition + brand/model/scale/material/
 *  manufacturer/year selects. Brand uses a Controller so changing it clears the
 *  model. Shared by new & edit forms. */
export default function ProductDetailsCard({
	locale,
	conditions,
	flatCategories,
	brands,
	brandsLoading,
	models,
	modelsLoading,
	scaleList,
	materialList,
	manufacturerList,
	yearOptions,
}: ProductDetailsCardProps) {
	const { setValue, watch } = useFormContext();
	const brandId = watch('brandId');
	const en = locale === 'en';

	const scales = scaleList.length > 0 ? scaleList : FALLBACK_SCALES;
	const materials = materialList.length > 0 ? materialList : FALLBACK_MATERIALS;

	return (
		<SectionCard title={en ? 'Product Details' : 'Ürün Detayları'}>
			<div className='grid md:grid-cols-2 gap-4'>
				<FormSelect
					name='categoryId'
					label={en ? 'Category *' : 'Kategori *'}
					placeholder={en ? 'Select category' : 'Kategori Seçin'}
					options={flatCategories.map((cat) => ({ value: cat.id, label: cat.name }))}
				/>
				<FormSelect
					name='condition'
					label={en ? 'Condition *' : 'Durum *'}
					options={conditions.map((c) => ({ value: c.value, label: c.label }))}
				/>
			</div>

			<div className='grid md:grid-cols-2 gap-4 mt-4'>
				<Controller
					name='brandId'
					render={({ field }) => (
						<Select
							label={en ? 'Brand' : 'Marka'}
							value={field.value ?? ''}
							onChange={(e) => {
								field.onChange(e.target.value);
								setValue('carModelId', '');
							}}
							options={brands.map((b) => ({ value: b.id, label: b.name }))}
							placeholder={
								brandsLoading
									? en
										? 'Loading...'
										: 'Yükleniyor...'
									: en
										? 'Select brand'
										: 'Marka Seçin'
							}
							disabled={brandsLoading}
						/>
					)}
				/>

				<FormSelect
					name='carModelId'
					label='Model'
					options={models.map((m) => ({ value: m.id, label: m.name }))}
					placeholder={
						!brandId
							? en
								? 'Select a brand first'
								: 'Önce marka seçin'
							: modelsLoading
								? en
									? 'Loading...'
									: 'Yükleniyor...'
								: models.length === 0
									? en
										? 'No models for this brand'
										: 'Bu markaya ait model yok'
									: en
										? 'Select model'
										: 'Model Seçin'
					}
					disabled={!brandId || modelsLoading}
				/>

				<FormSelect
					name='scale'
					label={en ? 'Scale' : 'Ölçek'}
					options={scales.map((s) => ({ value: s, label: s }))}
				/>

				<FormSelect
					name='material'
					label={en ? 'Material' : 'Malzeme'}
					placeholder={en ? 'Select material' : 'Malzeme seçin'}
					options={materials.map((m) => ({ value: m.slug, label: m.label }))}
				/>

				<FormSelect
					name='manufacturerId'
					label={en ? 'Manufacturer' : 'Üretici'}
					placeholder={en ? 'Select manufacturer' : 'Üretici seçin'}
					options={manufacturerList.map((m) => ({ value: m.id, label: m.name }))}
				/>

				<FormSelect
					name='year'
					label={en ? 'Release year' : 'Çıkış yılı'}
					placeholder={en ? 'Select year' : 'Yıl seçin'}
					helperText={
						en ? "Model's release year (optional)" : 'Modelin çıkış yılı (isteğe bağlı)'
					}
					options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
				/>
			</div>
		</SectionCard>
	);
}
