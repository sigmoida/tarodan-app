/** @format */

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useMutation } from '@tanstack/react-query';
import { Button, Input, Modal, Select, Spinner, Textarea } from '@tarodan/ui';
import { collectionsApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { useCollectionDetail } from '../_context/CollectionDetailContext';
import { useCollectionFilters } from '../_hooks/useCollectionFilters';
import { useCarModels } from '../_hooks/useCarModels';
import { useMyProducts } from '../_hooks/useMyProducts';

const PRODUCT_PLACEHOLDER =
	'https://placehold.co/80x80/374151/9ca3af?text=Ürün';

const EMPTY_CUSTOM = {
	title: '',
	description: '',
	brand: '',
	model: '',
	year: '' as number | '',
	scale: '',
	manufacturer: '',
	material: '',
};

export default function AddItemModal() {
	const { t, locale, collection, showAddModal, setShowAddModal, invalidateCollection } =
		useCollectionDetail();

	const [activeTab, setActiveTab] = useState<'products' | 'custom'>('products');
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
	const [custom, setCustom] = useState(EMPTY_CUSTOM);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);

	const filters = useCollectionFilters(showAddModal);
	const selectedBrandSlug = useMemo(
		() => filters.brands.find((b) => b.name === custom.brand)?.slug,
		[filters.brands, custom.brand],
	);
	const { models, isLoading: modelsLoading } = useCarModels(selectedBrandSlug);

	const existingProductIds = useMemo(
		() =>
			new Set(
				(collection?.items || [])
					.map((item) => item.productId)
					.filter((id): id is string => !!id),
			),
		[collection?.items],
	);
	const {
		products,
		isLoading: loadingProducts,
		refetch: refetchProducts,
	} = useMyProducts(showAddModal && activeTab === 'products', existingProductIds);

	const patchCustom = (patch: Partial<typeof EMPTY_CUSTOM>) =>
		setCustom((prev) => ({ ...prev, ...patch }));

	const close = () => {
		setShowAddModal(false);
		setSelectedProductIds([]);
		setCustom(EMPTY_CUSTOM);
		setImageFile(null);
		setImagePreview(null);
	};

	const toggleProduct = (productId: string) =>
		setSelectedProductIds((prev) =>
			prev.includes(productId)
				? prev.filter((id) => id !== productId)
				: [...prev, productId],
		);

	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setImageFile(file);
		const reader = new FileReader();
		reader.onloadend = () => setImagePreview(reader.result as string);
		reader.readAsDataURL(file);
	};

	// Batch-add: one product failing shouldn't abort the rest, and "already in
	// collection" counts as success — so evaluate each independently.
	const addProductsMutation = useMutation({
		mutationFn: async () => {
			const results = await Promise.allSettled(
				selectedProductIds.map((productId) =>
					collectionsApi.addItem(collection!.id, { productId }),
				),
			);
			let added = 0;
			let alreadyIn = 0;
			let failed = 0;
			for (const r of results) {
				if (r.status === 'fulfilled') {
					added++;
					continue;
				}
				const msg: string = r.reason?.response?.data?.message || '';
				if (
					r.reason?.response?.status === 400 &&
					msg.includes('zaten koleksiyonda')
				)
					alreadyIn++;
				else failed++;
			}
			return { added, alreadyIn, failed };
		},
		onSuccess: async ({ added, alreadyIn, failed }) => {
			await invalidateCollection();
			if (added > 0)
				toast.success(`${added} ${t('collection.productsAddedToCollection')}`);
			if (alreadyIn > 0) toast(`${alreadyIn} ${t('collection.alreadyInCollection')}`);
			if (failed > 0) toast.error(t('collection.productsAddFailed'));
			if (failed === 0) {
				close();
			} else {
				setSelectedProductIds([]);
				await refetchProducts();
			}
		},
		onError: (error: any) => {
			if (process.env.NODE_ENV === 'development')
				console.error('Failed to add items:', error);
			toast.error(error.response?.data?.message || t('collection.productsAddFailed'));
		},
	});

	const addCustomMutation = useMutation({
		mutationFn: () =>
			collectionsApi.addItem(collection!.id, {
				customTitle: custom.title.trim(),
				customDescription: custom.description.trim() || undefined,
				customBrand: custom.brand.trim() || undefined,
				customModel: custom.model.trim() || undefined,
				customYear: custom.year ? Number(custom.year) : undefined,
				customScale: custom.scale || undefined,
				customManufacturer: custom.manufacturer.trim() || undefined,
				customMaterial: custom.material || undefined,
				imageFile: imageFile || undefined,
			}),
		onSuccess: async () => {
			toast.success(t('collection.productsAddedToCollection'));
			await invalidateCollection();
			close();
		},
		onError: (error: any) => {
			if (process.env.NODE_ENV === 'development')
				console.error('Failed to add custom item:', error);
			toast.error(error.response?.data?.message || t('collection.productsAddFailed'));
		},
	});

	const handleAddProducts = () => {
		if (selectedProductIds.length === 0 || !collection) {
			toast.error(t('collection.selectItems'));
			return;
		}
		addProductsMutation.mutate();
	};

	const handleAddCustom = () => {
		if (!custom.title.trim() || !collection) {
			toast.error('Ürün ismi zorunludur');
			return;
		}
		addCustomMutation.mutate();
	};

	const adding = addProductsMutation.isPending || addCustomMutation.isPending;

	if (!collection) return null;

	const tabClass = (tab: 'products' | 'custom') =>
		`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
			activeTab === tab
				? 'bg-surface-elevated text-heading shadow-sm'
				: 'text-muted hover:text-body'
		}`;
	const labelClass = 'mb-1 block text-xs font-medium text-muted';

	return (
		<Modal
			isOpen={showAddModal}
			onClose={close}
			title={t('collection.addProductToCollection')}
			maxWidth='max-w-md'>
			<div>
				{/* Tabs */}
				<div className='mb-4 flex gap-1 rounded bg-surface-alt p-0.5'>
					<Button
						variant='secondary'
						onClick={() => setActiveTab('products')}
						className={tabClass('products')}>
						İlanlarım
					</Button>
					<Button
						variant='secondary'
						onClick={() => setActiveTab('custom')}
						className={tabClass('custom')}>
						Custom Ürün
					</Button>
				</div>

				{activeTab === 'products' &&
					(loadingProducts ? (
						<div className='flex justify-center py-8'>
							<Spinner size='lg' color='border-primary-500 border-t-transparent' />
						</div>
					) : products.length === 0 ? (
						<div className='py-8 text-center'>
							<p className='mb-3 text-sm text-muted'>
								{t('collection.noProductsToAdd')}
							</p>
							<Link
								href='/listings/new'
								className='text-sm font-medium text-primary-500 hover:text-primary-600'
								onClick={close}>
								{t('collection.createNewListing')} →
							</Link>
						</div>
					) : (
						<>
							<div className='mb-3 flex items-center justify-between'>
								<p className='text-xs text-muted'>
									{selectedProductIds.length > 0
										? `${selectedProductIds.length} ${t('collection.productsSelected')}`
										: t('collection.selectProducts')}
								</p>
								{selectedProductIds.length > 0 && (
									<Button
										variant='secondary'
										onClick={() => setSelectedProductIds([])}
										className='text-xs font-medium text-primary-600 hover:text-primary-700'>
										{t('collection.clearSelection')}
									</Button>
								)}
							</div>

							<div className='mb-4 max-h-[45vh] space-y-1.5 overflow-y-auto'>
								{products.map((product) => {
									const img0 = product.images?.[0];
									const imageUrl = img0
										? typeof img0 === 'string'
											? img0
											: (img0 as any).cardUrl ??
												(img0 as any).detailUrl ??
												(img0 as any).url
										: PRODUCT_PLACEHOLDER;
									const isSelected = selectedProductIds.includes(product.id);
									return (
										<Button
											variant='secondary'
											key={product.id}
											onClick={() => toggleProduct(product.id)}
											className={`flex w-full items-center gap-3 rounded p-2.5 transition-colors ${
												isSelected
													? 'border border-primary-200 bg-primary-50'
													: 'border border-border-subtle bg-surface hover:bg-surface-alt'
											}`}>
											<div className='relative'>
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img
													src={imageUrl}
													alt={product.title}
													className='h-12 w-12 rounded object-cover'
													onError={(e) => {
														(e.target as HTMLImageElement).src =
															PRODUCT_PLACEHOLDER;
													}}
												/>
												{isSelected && (
													<div className='absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500'>
														<svg
															className='h-2.5 w-2.5 text-inverted'
															fill='none'
															stroke='currentColor'
															viewBox='0 0 24 24'>
															<path
																strokeLinecap='round'
																strokeLinejoin='round'
																strokeWidth={3}
																d='M5 13l4 4L19 7'
															/>
														</svg>
													</div>
												)}
											</div>
											<div className='min-w-0 flex-1 text-left'>
												<p className='line-clamp-1 text-sm font-medium text-heading'>
													{product.title}
												</p>
												<p className='text-xs font-semibold text-primary-600'>
													{getProductEffectivePrice(product).toLocaleString(
														'tr-TR',
														{ minimumFractionDigits: 0, maximumFractionDigits: 0 },
													)}{' '}
													₺
												</p>
											</div>
										</Button>
									);
								})}
							</div>

							<div className='flex gap-3 border-t border-border pt-3'>
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
									onClick={handleAddProducts}
									disabled={selectedProductIds.length === 0 || adding}>
									{adding
										? `${t('common.adding')} (${selectedProductIds.length})`
										: selectedProductIds.length > 0
											? `${selectedProductIds.length} ${t('collection.addProduct')}`
											: t('common.add')}
								</Button>
							</div>
						</>
					))}

				{activeTab === 'custom' && (
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
				)}

				{activeTab === 'products' &&
					(products.length === 0 || loadingProducts) && (
						<Button
							variant='secondary'
							size='sm'
							className='mt-4 w-full'
							onClick={close}>
							{t('common.close')}
						</Button>
					)}
			</div>
		</Modal>
	);
}
