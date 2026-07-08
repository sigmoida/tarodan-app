/** @format */

'use client';

import { Button, Checkbox, Input } from '@tarodan/ui';
import {
	FormInput,
	FormSelect,
	FormTextarea,
	FormCheckbox,
	FormModal,
	useZodForm,
} from '@tarodan/ui/form';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { useSaveDiscount } from '../_hooks/useDiscounts';
import {
	emptyDiscountForm,
	type Discount,
	type DiscountFormData,
	type SellerProduct,
} from '../_lib/types';
import { discountSchema } from '../_lib/schema';

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

/** Create/edit discount — its own RHF+zod form + save mutation, framed by the
 *  shared `FormModal`. `value` and `targetProductIds` are custom-controlled. */
export default function DiscountFormModal({
	open,
	onClose,
	editing,
	products,
}: DiscountFormModalProps) {
	const save = useSaveDiscount();
	const form = useZodForm(discountSchema, { defaultValues: emptyDiscountForm() });
	const { register, setValue, watch, formState } = form;

	// Custom-driven fields still need to live in the form state.
	register('value');
	register('targetProductIds');
	const type = watch('type');
	const scope = watch('scope');
	const value = watch('value');
	const targetProductIds = watch('targetProductIds') ?? [];

	const toggleProduct = (id: string) =>
		setValue(
			'targetProductIds',
			targetProductIds.includes(id)
				? targetProductIds.filter((p) => p !== id)
				: [...targetProductIds, id],
			{ shouldValidate: true },
		);

	const onSubmit = (values: DiscountFormData) =>
		save.mutate({ id: editing?.id ?? null, form: values }, { onSuccess: onClose });

	return (
		<FormModal
			open={open}
			onClose={onClose}
			title={editing ? 'İndirimi Düzenle' : 'Yeni İndirim Oluştur'}
			form={form}
			onSubmit={onSubmit}
			isSubmitting={save.isPending}
			resetValues={editing ? fromDiscount(editing) : emptyDiscountForm()}
			submitLabel={editing ? 'Güncelle' : 'Oluştur'}
			maxWidth='max-w-2xl'>
			<FormInput name='name' label='İndirim Adı *' placeholder='Örn: Yaz İndirimi' />
			<FormTextarea
				name='description'
				label='Açıklama'
				rows={2}
				placeholder='İndirim açıklaması...'
			/>

			<div className='grid grid-cols-2 gap-4'>
				<FormSelect name='type' label='İndirim Türü *'>
					<option value='percentage'>Yüzde (%)</option>
					<option value='fixed_amount'>Sabit Tutar (TL)</option>
				</FormSelect>
				<Input
					label='Değer *'
					type='number'
					min='0'
					max={type === 'percentage' ? 100 : 10000}
					step={type === 'percentage' ? 1 : 0.01}
					value={value}
					onChange={(e) => setValue('value', parseFloat(e.target.value) || 0, { shouldValidate: true })}
					error={formState.errors.value?.message as string | undefined}
				/>
			</div>

			<div className='grid grid-cols-2 gap-4'>
				<FormSelect name='scope' label='Kapsam'>
					<option value='seller'>Tüm Mağaza</option>
					<option value='product'>Seçili Ürünler</option>
				</FormSelect>
				<FormInput name='code' label='İndirim Kodu (opsiyonel)' placeholder='Boşsa otomatik' />
			</div>

			{scope === 'product' && (
				<div>
					<div className='mb-2 flex items-center justify-between'>
						<label className='block text-sm font-medium text-body'>Ürün Seçin *</label>
						{products.length > 0 && (
							<Button
								type='button'
								variant='link'
								size='sm'
								onClick={() =>
									setValue(
										'targetProductIds',
										targetProductIds.length === products.length ? [] : products.map((p) => p.id),
										{ shouldValidate: true },
									)
								}>
								{targetProductIds.length === products.length ? 'Seçimi Kaldır' : 'Hepsini Seç'}
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
										checked={targetProductIds.includes(product.id)}
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
					{formState.errors.targetProductIds ? (
						<p className='mt-1 text-xs text-danger-600'>
							{formState.errors.targetProductIds.message as string}
						</p>
					) : (
						targetProductIds.length > 0 && (
							<p className='mt-1 text-xs text-muted'>{targetProductIds.length} ürün seçildi</p>
						)
					)}
				</div>
			)}

			<div className='grid grid-cols-2 gap-4'>
				<FormInput
					name='minCartValue'
					label='Min. Sepet Tutarı (TL)'
					type='number'
					min='0'
					step='0.01'
					placeholder='Örn: 100'
				/>
				<FormInput
					name='maxDiscountAmount'
					label='Max. İndirim Tutarı (TL)'
					type='number'
					min='0'
					step='0.01'
					placeholder='Örn: 500'
				/>
			</div>

			<div className='grid grid-cols-2 gap-4'>
				<FormInput
					name='usageLimitTotal'
					label='Toplam Kullanım Limiti'
					type='number'
					min='1'
					placeholder='Sınırsız'
				/>
				<FormInput name='usageLimitPerUser' label='Kullanıcı Başı Limit' type='number' min='1' />
			</div>

			<div className='grid grid-cols-2 gap-4'>
				<FormInput name='startDate' label='Başlangıç Tarihi *' type='date' />
				<FormInput name='endDate' label='Bitiş Tarihi *' type='date' />
			</div>

			<div className='flex items-center gap-6'>
				<FormCheckbox name='isStackable' label='Kombine edilebilir' />
				<FormCheckbox name='isActive' label='Aktif' />
			</div>
		</FormModal>
	);
}
