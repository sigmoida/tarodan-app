'use client';

import { useState, useEffect } from 'react';
import { FunnelIcon } from '@heroicons/react/24/outline';
import {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
	Button,
	Checkbox,
	Input,
	Radio,
} from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import { categoriesApi, manufacturersApi, listingsApi } from '@/lib/api';

interface Category {
	id: string;
	name: string;
	slug: string;
}

interface ManufacturerItem {
	id: string;
	name: string;
	slug: string;
	_count?: { products: number };
}

interface CustomAttributeGroup {
	slug: string;
	name: string;
	manufacturerSlug: string | null;
	attributes: Array<{ slug: string; label: string; color?: string | null }>;
}

interface SidebarFiltersProps {
	filters: {
		brand: string;
		brandId?: string;
		carModelId?: string;
		carModel?: string;
		scale: string;
		material?: string;
		condition: string;
		minPrice: string;
		maxPrice: string;
		tradeOnly: boolean;
		categoryId?: string;
		category?: string;
		manufacturer?: string;
		manufacturerId?: string;
		/**
		 * Manufacturer-scoped attribute selections: groupSlug -> selected attribute slugs.
		 */
		customAttributes?: Record<string, string[]>;
	};
	onFilterChange: (filters: any) => void;
	activeFilterCount: number;
	onClearFilters: () => void;
}

// Üreticiler - API'den yüklenecek, bu liste sadece fallback
const MANUFACTURERS_FALLBACK = [
	'Hot Wheels', 'Matchbox', 'Majorette', 'Tomica', 'Bburago', 'Maisto',
	'AUTOart', 'Minichamps', 'Kyosho', 'CMC', 'GT Spirit', 'Almost Real',
	'Spark', 'Schuco', 'Norev', 'Oxford Diecast', 'Greenlight', 'ERTL',
];

const BASE_SECTIONS = [
	'category',
	'brand',
	'model',
	'scale',
	'material',
	'manufacturer',
	'condition',
	'price',
	'options',
];

// Selected/active row styling reused by every option list.
const rowClass = (selected: boolean) =>
	`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
		selected ? 'bg-primary-100 text-primary-700' : 'text-body hover:bg-surface'
	}`;

export default function SidebarFilters({
	filters,
	onFilterChange,
	activeFilterCount,
}: SidebarFiltersProps) {
	const { t, locale } = useTranslation();

	const [categories, setCategories] = useState<Category[]>([]);
	const [manufacturerList, setManufacturerList] = useState<ManufacturerItem[]>([]);
	const [brandList, setBrandList] = useState<Array<{ id: string; name: string; slug: string }>>([]);
	const [scaleList, setScaleList] = useState<string[]>([]);
	const [materialList, setMaterialList] = useState<Array<{ slug: string; label: string }>>([]);
	const [carModelList, setCarModelList] = useState<Array<{ id: string; name: string; slug: string; brandId: string }>>([]);
	const [customAttrGroups, setCustomAttrGroups] = useState<CustomAttributeGroup[]>([]);
	const [customAttrSearch, setCustomAttrSearch] = useState<Record<string, string>>({});

	// Open accordion sections (controlled so async-loaded custom groups open too).
	const [openSections, setOpenSections] = useState<string[]>(BASE_SECTIONS);

	useEffect(() => {
		const fetchCategories = async () => {
			try {
				const response = await categoriesApi.findAll();
				const cats = Array.isArray(response.data) ? response.data : response.data.data || [];
				setCategories(cats);
			} catch (error) {
				console.error('Failed to fetch categories:', error);
			}
		};
		fetchCategories();

		const fetchManufacturers = async () => {
			try {
				const response = await manufacturersApi.findAll();
				const items = Array.isArray(response.data) ? response.data : response.data.data || [];
				setManufacturerList(items);
			} catch (error) {
				console.error('Failed to fetch manufacturers:', error);
			}
		};
		fetchManufacturers();

		const fetchFilters = async () => {
			try {
				const response = await listingsApi.getFilters();
				const data = response.data as {
					scales?: string[];
					materials?: Array<{ slug: string; label: string }>;
					brands?: string[] | Array<{ id: string; name: string; slug: string }>;
					carModels?: Array<{ id: string; name: string; slug: string; brandId: string }>;
				};
				if (data.scales?.length) setScaleList(data.scales);
				if (data.materials?.length) setMaterialList(data.materials);
				if (data.brands?.length) {
					const normalized = data.brands.map((b: any) =>
						typeof b === 'string'
							? { id: '', name: b, slug: b.toLowerCase().replace(/\s+/g, '-') }
							: b,
					);
					setBrandList(normalized);
				}
				if (data.carModels?.length) setCarModelList(data.carModels);
			} catch (error) {
				console.error('Failed to fetch filters:', error);
			}
		};
		fetchFilters();
	}, []);

	// Re-fetch manufacturer-scoped attribute groups whenever manufacturer changes.
	useEffect(() => {
		let slug: string | undefined;
		if (filters.manufacturerId) {
			slug = manufacturerList.find((m) => m.id === filters.manufacturerId)?.slug;
		} else if (filters.manufacturer) {
			slug = manufacturerList.find(
				(m) => m.name.toLowerCase() === filters.manufacturer!.toLowerCase(),
			)?.slug;
		}
		if (!slug) {
			setCustomAttrGroups([]);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const response = await listingsApi.getFilters({ manufacturer: slug });
				if (cancelled) return;
				const data = response.data as { customAttributes?: CustomAttributeGroup[] };
				setCustomAttrGroups(data.customAttributes ?? []);
			} catch (error) {
				console.error('Failed to fetch manufacturer-scoped filters:', error);
				if (!cancelled) setCustomAttrGroups([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [filters.manufacturer, filters.manufacturerId, manufacturerList]);

	// Open custom-attribute groups by default once they load.
	useEffect(() => {
		if (customAttrGroups.length === 0) return;
		setOpenSections((prev) => [
			...new Set([...prev, ...customAttrGroups.map((g) => `customAttr:${g.slug}`)]),
		]);
	}, [customAttrGroups]);

	const [brandSearch, setBrandSearch] = useState('');
	const [manufacturerSearch, setManufacturerSearch] = useState('');
	const [modelSearch, setModelSearch] = useState('');

	const CONDITIONS = [
		{ value: 'new', label: locale === 'en' ? 'New' : 'Yeni' },
		{ value: 'like_new', label: locale === 'en' ? 'Like New' : 'Yeni Gibi' },
		{ value: 'very_good', label: locale === 'en' ? 'Very Good' : 'Çok İyi' },
		{ value: 'good', label: locale === 'en' ? 'Good' : 'İyi' },
		{ value: 'fair', label: locale === 'en' ? 'Fair' : 'Orta' },
	];

	const handleBrandChange = (brandId: string, brandName: string) => {
		const isCurrentlySelected = brandId
			? filters.brandId === brandId
			: filters.brand === brandName;
		if (isCurrentlySelected) {
			onFilterChange({ ...filters, brandId: '', brand: '', carModelId: '', carModel: '' });
		} else {
			onFilterChange({ ...filters, brandId, brand: brandName, carModelId: '', carModel: '' });
		}
	};

	const handleCarModelChange = (carModelId: string, carModelName: string) => {
		if (filters.carModelId === carModelId) {
			onFilterChange({ ...filters, carModelId: '', carModel: '' });
		} else {
			onFilterChange({ ...filters, carModelId, carModel: carModelName });
		}
	};

	const handleScaleChange = (scale: string) => {
		onFilterChange({ ...filters, scale: filters.scale === scale ? '' : scale });
	};

	const handleMaterialChange = (materialSlug: string) => {
		onFilterChange({
			...filters,
			material: filters.material === materialSlug ? '' : materialSlug,
		});
	};

	const handleConditionChange = (condition: string) => {
		onFilterChange({
			...filters,
			condition: filters.condition === condition ? '' : condition,
		});
	};

	const handleManufacturerChange = (manufacturerId: string, manufacturerName: string) => {
		if (filters.manufacturerId === manufacturerId) {
			onFilterChange({ ...filters, manufacturerId: '', manufacturer: '', customAttributes: {} });
		} else {
			onFilterChange({ ...filters, manufacturerId, manufacturer: manufacturerName, customAttributes: {} });
		}
	};

	const toggleCustomAttribute = (groupSlug: string, attrSlug: string) => {
		const current = filters.customAttributes?.[groupSlug] ?? [];
		const isSelected = current.includes(attrSlug);
		const nextMap = { ...(filters.customAttributes ?? {}) };
		if (isSelected) {
			const remaining = current.filter((s) => s !== attrSlug);
			if (remaining.length > 0) nextMap[groupSlug] = remaining;
			else delete nextMap[groupSlug];
		} else {
			nextMap[groupSlug] = [...current, attrSlug];
		}
		onFilterChange({ ...filters, customAttributes: nextMap });
	};

	const handleCategoryChange = (categoryId: string, categoryName: string) => {
		if (filters.categoryId === categoryId) {
			onFilterChange({ ...filters, categoryId: '', category: '' });
		} else {
			onFilterChange({ ...filters, categoryId, category: categoryName });
		}
	};

	const filteredBrands = brandList.length > 0
		? brandList.filter((b) => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
		: [];

	const modelsForBrand = carModelList.filter(
		(m) =>
			(!filters.brandId || m.brandId === filters.brandId) &&
			m.name.toLowerCase().includes(modelSearch.toLowerCase()),
	);

	const displayManufacturers = manufacturerList.length > 0
		? manufacturerList.filter((m) =>
				m.name.toLowerCase().includes(manufacturerSearch.toLowerCase()),
			)
		: MANUFACTURERS_FALLBACK.filter((m) =>
				m.toLowerCase().includes(manufacturerSearch.toLowerCase()),
			).map((name) => ({ id: '', name, slug: name.toLowerCase().replace(/\s+/g, '-') }));

	return (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border-subtle">
				<div className="flex items-center gap-2">
					<FunnelIcon className="w-5 h-5 text-muted" />
					<span className="font-semibold text-heading">{t('product.filters')}</span>
					{activeFilterCount > 0 && (
						<span className="px-2 py-0.5 bg-primary-500 text-inverted text-xs font-bold rounded-sm">
							{activeFilterCount}
						</span>
					)}
				</div>
			</div>

			<Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
				{/* Araç Türü (Category) */}
				<AccordionItem value="category">
					<AccordionTrigger>{locale === 'en' ? 'Vehicle Type' : 'Araç Türü'}</AccordionTrigger>
					<AccordionContent>
						<div className="space-y-1">
							{categories.map((cat) => (
								<Button variant="secondary" key={cat.id}
									onClick={() => handleCategoryChange(cat.id, cat.name)}
									className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors ${filters.categoryId === cat.id
										? 'bg-primary-100 text-primary-700'
										: 'text-body hover:bg-surface'
										}`}>
									<span>{cat.name}</span>
								</Button>
							))}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Marka */}
				<AccordionItem value="brand">
					<AccordionTrigger>{locale === 'en' ? 'Brand' : 'Marka'}</AccordionTrigger>
					<AccordionContent>
						<Input
							type="text"
							placeholder={locale === 'en' ? 'Search brands...' : 'Marka ara...'}
							value={brandSearch}
							onChange={(e) => setBrandSearch(e.target.value)}
							inputSize="sm"
							className="rounded border-border focus:border-primary-400 mb-2"
						/>
						<div className="space-y-1">
							{filteredBrands.map((brand) => {
								const isSelected = filters.brandId
									? filters.brandId === brand.id
									: filters.brand === brand.name;
								return (
									<label key={brand.id} className={rowClass(isSelected)}>
										<Radio name="brand"
											checked={isSelected}
											onChange={() => handleBrandChange(brand.id, brand.name)}
											className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
										<span className="text-sm">{brand.name}</span>
									</label>
								);
							})}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Model */}
				<AccordionItem value="model">
					<AccordionTrigger>Model</AccordionTrigger>
					<AccordionContent>
						<Input
							type="text"
							placeholder={locale === 'en' ? 'Search models...' : 'Model ara...'}
							value={modelSearch}
							onChange={(e) => setModelSearch(e.target.value)}
							inputSize="sm"
							className="rounded border-border focus:border-primary-400 mb-2"
						/>
						<div className="space-y-1 max-h-48 overflow-y-auto">
							{modelsForBrand.map((m) => {
								const isSelected = filters.carModelId === m.id;
								return (
									<label key={m.id} className={rowClass(isSelected)}>
										<Radio name="carModel"
											checked={isSelected}
											onChange={() => handleCarModelChange(m.id, m.name)}
											className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
										<span className="text-sm">{m.name}</span>
									</label>
								);
							})}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Ölçek */}
				<AccordionItem value="scale">
					<AccordionTrigger>{locale === 'en' ? 'Scale' : 'Ölçek'}</AccordionTrigger>
					<AccordionContent>
						<div className="grid grid-cols-3 gap-2">
							{(scaleList.length > 0 ? scaleList : ['1:18', '1:24', '1:43', '1:64', '1:87']).map((scale) => (
								<Button variant="secondary" key={scale}
									onClick={() => handleScaleChange(scale)}
									className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${filters.scale === scale
										? 'bg-primary-500 text-inverted'
										: 'bg-surface-alt text-body hover:bg-border-subtle'
										}`}>
									{scale}
								</Button>
							))}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Malzeme (Material) */}
				<AccordionItem value="material">
					<AccordionTrigger>{locale === 'en' ? 'Material' : 'Malzeme'}</AccordionTrigger>
					<AccordionContent>
						<div className="space-y-1">
							{(materialList.length > 0 ? materialList : [
								{ slug: 'diecast', label: 'Diecast (Metal)' },
								{ slug: 'resin', label: 'Resin (Reçine)' },
								{ slug: 'composite', label: 'Composite (Kompozit)' },
								{ slug: 'plastic', label: 'Plastic (Plastik)' },
							]).map((m) => (
								<Button variant="secondary" key={m.slug}
									onClick={() => handleMaterialChange(m.slug)}
									className={`flex items-center w-full px-2 py-1.5 text-left text-sm rounded transition-colors ${filters.material === m.slug
										? 'bg-primary-100 text-primary-700'
										: 'text-body hover:bg-surface'
										}`}>
									{m.label}
								</Button>
							))}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Üretici */}
				<AccordionItem value="manufacturer">
					<AccordionTrigger>{locale === 'en' ? 'Manufacturer' : 'Üretici'}</AccordionTrigger>
					<AccordionContent>
						<Input
							type="text"
							placeholder={locale === 'en' ? 'Search manufacturers...' : 'Üretici ara...'}
							value={manufacturerSearch}
							onChange={(e) => setManufacturerSearch(e.target.value)}
							inputSize="sm"
							className="rounded border-border focus:border-primary-400 mb-2"
						/>
						<div className="space-y-1">
							{displayManufacturers.map((m) => {
								const isSelected = m.id
									? filters.manufacturerId === m.id
									: filters.manufacturer === m.name;
								return (
									<label key={m.id || m.name} className={rowClass(isSelected)}>
										<Radio name="manufacturer"
											checked={isSelected}
											onChange={() => handleManufacturerChange(m.id, m.name)}
											className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
										<span className="text-sm">{m.name}</span>
									</label>
								);
							})}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Manufacturer-scoped custom attribute groups (e.g. Hot Wheels Segment/Assortment/...) */}
				{customAttrGroups.map((group) => {
					const selected = new Set(filters.customAttributes?.[group.slug] ?? []);
					const searchTerm = customAttrSearch[group.slug] ?? '';
					const filteredAttrs = searchTerm
						? group.attributes.filter((a) =>
								a.label.toLowerCase().includes(searchTerm.toLowerCase()),
							)
						: group.attributes;
					const showSearch = group.attributes.length > 15;
					return (
						<AccordionItem key={group.slug} value={`customAttr:${group.slug}`}>
							<AccordionTrigger>
								<span className="flex items-center">
									{group.name}
									{selected.size > 0 && (
										<span className="ml-2 px-1.5 py-0.5 bg-primary-500 text-inverted text-xs font-bold rounded-sm">
											{selected.size}
										</span>
									)}
								</span>
							</AccordionTrigger>
							<AccordionContent>
								{showSearch && (
									<Input
										type="text"
										placeholder={locale === 'en' ? `Search ${group.name}...` : `${group.name} ara...`}
										value={searchTerm}
										onChange={(e) =>
											setCustomAttrSearch((s) => ({ ...s, [group.slug]: e.target.value }))
										}
										inputSize="sm"
										className="rounded border-border focus:border-primary-400 mb-2"
									/>
								)}
								<div className={`space-y-1 ${group.attributes.length > 15 ? 'max-h-64 overflow-y-auto' : ''}`}>
									{filteredAttrs.map((attr) => {
										const isSelected = selected.has(attr.slug);
										return (
											<label key={attr.slug} className={rowClass(isSelected)}>
												<Checkbox
													checked={isSelected}
													onChange={() => toggleCustomAttribute(group.slug, attr.slug)}
													className="w-4 h-4"
												/>
												{attr.color && (
													<span
														className="w-3 h-3 rounded-full border border-border-subtle flex-shrink-0"
														style={{ backgroundColor: attr.color }}
														aria-hidden="true"
													/>
												)}
												<span className="text-sm">{attr.label}</span>
											</label>
										);
									})}
								</div>
							</AccordionContent>
						</AccordionItem>
					);
				})}

				{/* Durum */}
				<AccordionItem value="condition">
					<AccordionTrigger>{t('product.condition')}</AccordionTrigger>
					<AccordionContent>
						<div className="space-y-1">
							{CONDITIONS.map((condition) => (
								<label key={condition.value} className={rowClass(filters.condition === condition.value)}>
									<Radio name="condition"
										checked={filters.condition === condition.value}
										onChange={() => handleConditionChange(condition.value)}
										className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
									<span className="text-sm">{condition.label}</span>
								</label>
							))}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Fiyat */}
				<AccordionItem value="price">
					<AccordionTrigger>{locale === 'en' ? 'Price' : 'Fiyat'}</AccordionTrigger>
					<AccordionContent>
						<div className="space-y-2">
							<div className="flex gap-2 items-center">
								<Input
									type="number"
									placeholder="Min ₺"
									value={filters.minPrice}
									onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value })}
									inputSize="sm"
									className="flex-1 min-w-0 px-2 rounded border-border focus:border-primary-400"
								/>
								<span className="text-subtle flex-shrink-0">-</span>
								<Input
									type="number"
									placeholder="Max ₺"
									value={filters.maxPrice}
									onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value })}
									inputSize="sm"
									className="flex-1 min-w-0 px-2 rounded border-border focus:border-primary-400"
								/>
							</div>
							<div className="flex flex-wrap gap-1">
								{['0-100', '100-500', '500-1000', '1000+'].map((range) => {
									const [min, max] = range.split('-');
									const isActive = filters.minPrice === (min || '') && filters.maxPrice === (max || '');
									return (
										<Button variant="secondary" key={range}
											onClick={() => {
												if (isActive) {
													onFilterChange({ ...filters, minPrice: '', maxPrice: '' });
												} else {
													onFilterChange({
														...filters,
														minPrice: min === '1000+' ? '1000' : min,
														maxPrice: max === undefined ? '' : max,
													});
												}
											}}
											className={`px-2 py-1 text-xs rounded transition-colors ${isActive
												? 'bg-primary-500 text-inverted'
												: 'bg-surface-alt text-muted hover:bg-border-subtle'
												}`}>
											{range === '1000+' ? '₺1000+' : `₺${range}`}
										</Button>
									);
								})}
							</div>
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Diğer Seçenekler */}
				<AccordionItem value="options">
					<AccordionTrigger>{locale === 'en' ? 'Options' : 'Seçenekler'}</AccordionTrigger>
					<AccordionContent>
						<label className="flex items-center gap-3 px-2 py-2 rounded cursor-pointer hover:bg-surface">
							<Checkbox
								checked={filters.tradeOnly}
								onChange={(e) => onFilterChange({ ...filters, tradeOnly: e.target.checked })}
								className="h-5 w-5"
							/>
							<div>
								<span className="text-sm font-medium text-body">{t('product.tradeAvailable')}</span>
								<p className="text-xs text-muted">
									{locale === 'en' ? 'Only show items available for trade' : 'Sadece takas yapılabilir ürünleri göster'}
								</p>
							</div>
						</label>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	);
}
