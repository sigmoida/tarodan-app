/** @format */

'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Checkbox, Input, Modal, Select, Textarea } from '@tarodan/ui';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { useSaveDiscount } from '../_hooks/useDiscounts';
import {
	emptyDiscountForm,
	type Discount,
	type DiscountFormData,
	type SellerProduct,
} from '../_lib/types';

interface DiscountFormModalProps {
	open: boolean;
	onClose: () => void;
	editing: Discount | null;
	products: SellerProduct[];
}

function fromDiscount(d: Discount): DiscountFormData {
	return {
		code: d.code || '',
		name: d.name,
		description: d.description || '',
		type: d.type,
		value: d.value,
		scope: d.scope === 'product' ? 'product' : 'seller',
		targetProductIds: d.targetProductIds || [],
		minCartValue: d.minCartValue?.toString() || '',
		maxDiscountAmount: d.maxDiscountAmount?.toString() || '',
		usageLimitTotal: d.usageLimitTotal?.toString() || '',
		usageLimitPerUser: d.usageLimitPerUser.toString(),
		isStackable: d.isStackable,
		isActive: d.isActive,
		startDate: d.startDate.split('T')[0],
		endDate: d.endDate.split('T')[0],
	};
}

export default function DiscountFormModal({
	open,
	onClose,
	editing,
	products,
}: DiscountFormModalProps) {
	const save = useSaveDiscount();
	const [form, setForm] = useState<DiscountFormData>(emptyDiscountForm());

	useEffect(() => {
		if (open) setForm(editing ? fromDiscount(editing) : emptyDiscountForm());
	}, [open, editing]);

	const set = <K extends keyof DiscountFormData>(key: K, value: DiscountFormData[K]) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const toggleProduct = (id: string) =>
		setForm((prev) => ({
			...prev,
			targetProductIds: prev.targetProductIds.includes(id)
				? prev.targetProductIds.filter((p) => p !== id)
				: [...prev.targetProductIds, id],
		}));

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		if (form.scope === 'product' && form.targetProductIds.length === 0) {
			toast.error('Lütfen en az bir ürün seçin');
			return;
		}
		save.mutate({ id: editing?.id ?? null, form }, { onSuccess: onClose });
	};

	return (
		<Modal
			isOpen={open}
			onClose={onClose}
			title={editing ? 'İndirimi Düzenle' : 'Yeni İndirim Oluştur'}
			maxWidth='max-w-2xl'>
			<form onSubmit={submit} className='space-y-4'>
				<Input
					label='İndirim Adı *'
					required
					value={form.name}
					onChange={(e) => set('name', e.target.value)}
					placeholder='Örn: Yaz İndirimi'
				/>
				<Textarea
					label='Açıklama'
					value={form.description}
					onChange={(e) => set('description', e.target.value)}
					placeholder='İndirim açıklaması...'
					rows={2}
				/>

				<div className='grid grid-cols-2 gap-4'>
					<Select
						label='İndirim Türü *'
						value={form.type}
						onChange={(e) => set('type', e.target.value as DiscountFormData['type'])}>
						<option value='percentage'>Yüzde (%)</option>
						<option value='fixed_amount'>Sabit Tutar (TL)</option>
					</Select>
					<Input
						label='Değer *'
						type='number'
						required
						min='0'
						max={form.type === 'percentage' ? 100 : 10000}
						step={form.type === 'percentage' ? 1 : 0.01}
						value={form.value}
						onChange={(e) => set('value', parseFloat(e.target.value) || 0)}
					/>
				</div>

				<div className='grid grid-cols-2 gap-4'>
					<Select
						label='Kapsam'
						value={form.scope}
						onChange={(e) => set('scope', e.target.value as DiscountFormData['scope'])}>
						<option value='seller'>Tüm Mağaza</option>
						<option value='product'>Seçili Ürünler</option>
					</Select>
					<Input
						label='İndirim Kodu (opsiyonel)'
						value={form.code}
						onChange={(e) => set('code', e.target.value)}
						placeholder='Boşsa otomatik'
					/>
				</div>

				{form.scope === 'product' && (
					<div>
						<div className='mb-2 flex items-center justify-between'>
							<label className='block text-sm font-medium text-body'>Ürün Seçin *</label>
							{products.length > 0 && (
								<Button
									type='button'
									variant='link'
									size='sm'
									onClick={() =>
										set(
											'targetProductIds',
											form.targetProductIds.length === products.length
												? []
												: products.map((p) => p.id),
										)
									}>
									{form.targetProductIds.length === products.length ? 'Seçimi Kaldır' : 'Hepsini Seç'}
								</Button>
							)}
						</div>
						{products.length === 0 ? (
							<p className='rounded-lg bg-surface p-4 text-sm text-muted'>
								Aktif ürününüz bulunmuyor
							</p>
						) : (
							<div className='max-h-48 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border'>
								{products.map((product) => (
									<label
										key={product.id}
										className='flex cursor-pointer items-center gap-3 p-3 hover:bg-surface'>
										<Checkbox
											checked={form.targetProductIds.includes(product.id)}
											onChange={() => toggleProduct(product.id)}
										/>
										<div className='min-w-0 flex-1'>
											<p className='truncate text-sm font-medium text-heading'>{product.title}</p>
											<p className='text-xs text-muted'>
												{getProductEffectivePrice(product).toLocaleString('tr-TR')} TL
											</p>
										</div>
									</label>
								))}
							</div>
						)}
						{form.targetProductIds.length > 0 && (
							<p className='mt-1 text-xs text-muted'>
								{form.targetProductIds.length} ürün seçildi
							</p>
						)}
					</div>
				)}

				<div className='grid grid-cols-2 gap-4'>
					<Input
						label='Min. Sepet Tutarı (TL)'
						type='number'
						min='0'
						step='0.01'
						value={form.minCartValue}
						onChange={(e) => set('minCartValue', e.target.value)}
						placeholder='Örn: 100'
					/>
					<Input
						label='Max. İndirim Tutarı (TL)'
						type='number'
						min='0'
						step='0.01'
						value={form.maxDiscountAmount}
						onChange={(e) => set('maxDiscountAmount', e.target.value)}
						placeholder='Örn: 500'
					/>
				</div>

				<div className='grid grid-cols-2 gap-4'>
					<Input
						label='Toplam Kullanım Limiti'
						type='number'
						min='1'
						value={form.usageLimitTotal}
						onChange={(e) => set('usageLimitTotal', e.target.value)}
						placeholder='Sınırsız'
					/>
					<Input
						label='Kullanıcı Başı Limit'
						type='number'
						min='1'
						value={form.usageLimitPerUser}
						onChange={(e) => set('usageLimitPerUser', e.target.value)}
					/>
				</div>

				<div className='grid grid-cols-2 gap-4'>
					<Input
						label='Başlangıç Tarihi *'
						type='date'
						required
						value={form.startDate}
						onChange={(e) => set('startDate', e.target.value)}
					/>
					<Input
						label='Bitiş Tarihi *'
						type='date'
						required
						value={form.endDate}
						onChange={(e) => set('endDate', e.target.value)}
					/>
				</div>

				<div className='flex items-center gap-6'>
					<Checkbox
						checked={form.isStackable}
						onChange={(e) => set('isStackable', e.target.checked)}
						label='Kombine edilebilir'
					/>
					<Checkbox
						checked={form.isActive}
						onChange={(e) => set('isActive', e.target.checked)}
						label='Aktif'
					/>
				</div>

				<div className='flex justify-end gap-3 border-t border-border-subtle pt-4'>
					<Button type='button' variant='secondary' onClick={onClose}>
						İptal
					</Button>
					<Button type='submit' isLoading={save.isPending}>
						{editing ? 'Güncelle' : 'Oluştur'}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
