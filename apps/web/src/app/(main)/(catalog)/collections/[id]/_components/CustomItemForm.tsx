/** @format */

'use client';

import { Button, Input, Select, Textarea } from '@tarodan/ui';
import type { UseAddItem } from '../_hooks/useAddItem';

export default function CustomItemForm({ s }: { s: UseAddItem }) {
	const {
		t,
		custom,
		patchCustom,
		imagePreview,
		handleImageChange,
		filters,
		models,
		modelsLoading,
		handleAddCustom,
		adding,
		close,
	} = s;

	const labelClass = 'mb-1 block text-xs font-medium text-muted';

	return (
		<div className='max-h-[55vh] overflow-y-auto'>
			<div className='space-y-3'>
				<div>
					<label className={labelClass}>
						İsim <span className='text-danger-500'>*</span>
					</label>
					<Input
						type='text'
						value={custom.title}
						onChange={(e) => patchCustom({ title: e.target.value })}
						placeholder='Ürün ismi'
					/>
				</div>
				<div>
					<label className={labelClass}>Resim</label>
					<Input type='file' accept='image/*' onChange={handleImageChange} />
					{imagePreview && (
						<div className='mt-2'>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={imagePreview}
								alt='Preview'
								className='h-24 w-24 rounded object-cover'
							/>
						</div>
					)}
				</div>
				<div>
					<label className={labelClass}>Açıklama</label>
					<Textarea
						value={custom.description}
						onChange={(e) => patchCustom({ description: e.target.value })}
						rows={2}
						placeholder='Açıklama'
					/>
				</div>
				<div className='grid grid-cols-2 gap-3'>
					<div>
						<label className={labelClass}>Marka</label>
						<Select
							value={custom.brand}
							onChange={(e) =>
								patchCustom({ brand: e.target.value, model: '' })
							}
							selectSize='sm'>
							<option value=''>Marka seçin</option>
							{filters.brands.map((b) => (
								<option key={b.id} value={b.name}>
									{b.name}
								</option>
							))}
						</Select>
					</div>
					<div>
						<label className={labelClass}>Model</label>
						<Select
							value={custom.model}
							onChange={(e) => patchCustom({ model: e.target.value })}
							disabled={!custom.brand || modelsLoading}
							selectSize='sm'>
							<option value=''>
								{modelsLoading ? 'Yükleniyor...' : 'Model seçin'}
							</option>
							{models.map((m) => (
								<option key={m.id} value={m.name}>
									{m.name}
								</option>
							))}
						</Select>
					</div>
				</div>
				<div className='grid grid-cols-2 gap-3'>
					<div>
						<label className={labelClass}>Yıl</label>
						<Input
							type='number'
							value={custom.year}
							onChange={(e) =>
								patchCustom({
									year: e.target.value ? parseInt(e.target.value) : '',
								})
							}
							min='1900'
							max='2100'
							placeholder='Yıl'
						/>
					</div>
					<div>
						<label className={labelClass}>Ölçek</label>
						<Select
							value={custom.scale}
							onChange={(e) => patchCustom({ scale: e.target.value })}
							selectSize='sm'>
							<option value=''>Seçiniz</option>
							{filters.scales.map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</Select>
					</div>
				</div>
				<div className='grid grid-cols-2 gap-3'>
					<div>
						<label className={labelClass}>Üretici</label>
						<Select
							value={custom.manufacturer}
							onChange={(e) => patchCustom({ manufacturer: e.target.value })}
							selectSize='sm'>
							<option value=''>Üretici seçin</option>
							{filters.manufacturers.map((m) => (
								<option key={m.id} value={m.name}>
									{m.name}
								</option>
							))}
						</Select>
					</div>
					<div>
						<label className={labelClass}>Malzeme</label>
						<Select
							value={custom.material}
							onChange={(e) => patchCustom({ material: e.target.value })}
							selectSize='sm'>
							<option value=''>Malzeme seçin</option>
							{filters.materials.map((m) => (
								<option key={m.slug} value={m.slug}>
									{m.label}
								</option>
							))}
						</Select>
					</div>
				</div>
			</div>

			<div className='mt-4 flex gap-3 border-t border-border pt-4'>
				<Button
					variant='secondary'
					size='sm'
					className='flex-1'
					onClick={close}>
					{t('common.cancel')}
				</Button>
				<Button
					variant='primary'
					size='sm'
					className='flex-1'
					onClick={handleAddCustom}
					disabled={!custom.title.trim() || adding}>
					{adding ? t('common.adding') : t('common.add')}
				</Button>
			</div>
		</div>
	);
}
