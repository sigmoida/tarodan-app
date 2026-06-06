'use client';

import { useState, useEffect } from 'react';
import {
    FunnelIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { categoriesApi, manufacturersApi, listingsApi } from '@/lib/api';
import { Button, Checkbox, Input, Radio } from '@tarodan/ui';

interface Category {
    id: string;
    name: string;
    slug: string;
}

interface FilterSection {
    id: string;
    title: string;
    type: 'checkbox' | 'radio' | 'range';
    options?: { value: string; label: string; count?: number }[];
    items?: string[];
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
         * Only populated when a manufacturer with scoped attribute groups is selected (e.g. Hot Wheels).
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

export default function SidebarFilters({
    filters,
    onFilterChange,
    activeFilterCount,
    onClearFilters,
}: SidebarFiltersProps) {
    const { t, locale } = useTranslation();

    // Fetch categories from API
    const [categories, setCategories] = useState<Category[]>([]);

    // Fetch manufacturers from API
    const [manufacturerList, setManufacturerList] = useState<ManufacturerItem[]>([]);
    
    // Fetch brands from API
    const [brandList, setBrandList] = useState<Array<{ id: string; name: string; slug: string }>>([]);

    // Scales, materials, car models from getFilters API
    const [scaleList, setScaleList] = useState<string[]>([]);
    const [materialList, setMaterialList] = useState<Array<{ slug: string; label: string }>>([]);
    const [carModelList, setCarModelList] = useState<Array<{ id: string; name: string; slug: string; brandId: string }>>([]);

    // Manufacturer-scoped custom attribute groups (e.g. Hot Wheels Segment/Assortment/...).
    // Re-fetched whenever the selected manufacturer changes.
    const [customAttrGroups, setCustomAttrGroups] = useState<CustomAttributeGroup[]>([]);
    const [customAttrSearch, setCustomAttrSearch] = useState<Record<string, string>>({});

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
                            : b
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
    // When no manufacturer is selected, customAttrGroups stays empty — HW blocks vanish.
    // Resolves slug from the manufacturerList lookup (DB-authoritative) so accented or
    // special-character names don't produce mismatched ad-hoc slugs.
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

    // Collapsed state for each section
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
        category: false,
        brand: false,
        model: false,
        scale: false,
        material: false,
        manufacturer: false,
        condition: false,
        price: false,
        options: false,
    });

    // Search within filters
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

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

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
        onFilterChange({
            ...filters,
            scale: filters.scale === scale ? '' : scale,
        });
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
            // Clearing manufacturer also clears any custom attribute selections — they only make
            // sense in the context of the selected manufacturer.
            onFilterChange({ ...filters, manufacturerId: '', manufacturer: '', customAttributes: {} });
        } else {
            onFilterChange({ ...filters, manufacturerId, manufacturer: manufacturerName, customAttributes: {} });
        }
    };

    const toggleCustomAttribute = (groupSlug: string, attrSlug: string) => {
        const current = filters.customAttributes?.[groupSlug] ?? [];
        const next = current.includes(attrSlug)
            ? current.filter((s) => s !== attrSlug)
            : [...current, attrSlug];
        const nextMap = { ...(filters.customAttributes ?? {}) };
        if (next.length === 0) {
            delete nextMap[groupSlug];
        } else {
            nextMap[groupSlug] = next;
        }
        onFilterChange({ ...filters, customAttributes: nextMap });
    };

    // Category change - update URL with categoryId
    const handleCategoryChange = (categoryId: string, categoryName: string) => {
        if (filters.categoryId === categoryId) {
            onFilterChange({ ...filters, categoryId: '', category: '' });
        } else {
            onFilterChange({ ...filters, categoryId, category: categoryName });
        }
    };

    const filteredBrands = brandList.length > 0
        ? brandList.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
        : [];

    const modelsForBrand = carModelList.filter(m =>
        (!filters.brandId || m.brandId === filters.brandId) &&
        m.name.toLowerCase().includes(modelSearch.toLowerCase())
    );

    const displayManufacturers = manufacturerList.length > 0
        ? manufacturerList.filter(m => m.name.toLowerCase().includes(manufacturerSearch.toLowerCase()))
        : MANUFACTURERS_FALLBACK
            .filter(m => m.toLowerCase().includes(manufacturerSearch.toLowerCase()))
            .map(name => ({ id: '', name, slug: name.toLowerCase().replace(/\s+/g, '-') }));

    return (
        <div className="bg-surface-elevated rounded shadow-sm border border-border-subtle flex flex-col">
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

            {/* Filter Sections */}
            <div className="divide-y divide-border-subtle">

                {/* Araç Türü (Category) - loaded from API */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('category')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Vehicle Type' : 'Araç Türü'}
                        </span>
                        {collapsedSections.category ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.category && (
                        <div className="mt-3 space-y-1">
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
                    )}
                </div>

                {/* Marka */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('brand')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Brand' : 'Marka'}
                        </span>
                        {collapsedSections.brand ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.brand && (
                        <div className="mt-3">
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
                                        <label
                                            key={brand.id}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected
                                                ? 'bg-primary-100 text-primary-700'
                                                : 'text-body hover:bg-surface'
                                                }`}
                                        >
                                            <Radio name="brand"
                                                checked={isSelected}
                                                onChange={() => handleBrandChange(brand.id, brand.name)}
                                                className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
                                            <span className="text-sm">{brand.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Model */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('model')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Model' : 'Model'}
                        </span>
                        {collapsedSections.model ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.model && (
                        <div className="mt-3">
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
                                        <label
                                            key={m.id}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected
                                                ? 'bg-primary-100 text-primary-700'
                                                : 'text-body hover:bg-surface'
                                                }`}
                                        >
                                            <Radio name="carModel"
                                                checked={isSelected}
                                                onChange={() => handleCarModelChange(m.id, m.name)}
                                                className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
                                            <span className="text-sm">{m.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Ölçek */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('scale')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Scale' : 'Ölçek'}
                        </span>
                        {collapsedSections.scale ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.scale && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
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
                    )}
                </div>

                {/* Malzeme (Material) */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('material')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Material' : 'Malzeme'}
                        </span>
                        {collapsedSections.material ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.material && (
                        <div className="mt-3 space-y-1">
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
                    )}
                </div>

                {/* Üretici */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('manufacturer')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Manufacturer' : 'Üretici'}
                        </span>
                        {collapsedSections.manufacturer ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.manufacturer && (
                        <div className="mt-3">
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
                                        <label
                                            key={m.id || m.name}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected
                                                ? 'bg-primary-100 text-primary-700'
                                                : 'text-body hover:bg-surface'
                                                }`}
                                        >
                                            <Radio name="manufacturer"
                                                checked={isSelected}
                                                onChange={() => handleManufacturerChange(m.id, m.name)}
                                                className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
                                            <span className="text-sm">{m.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Manufacturer-scoped custom attribute groups (e.g. Hot Wheels Segment/Assortment/Wheel Type/...) */}
                {customAttrGroups.map((group) => {
                    const sectionKey = `customAttr:${group.slug}`;
                    const isCollapsed = collapsedSections[sectionKey] ?? false;
                    const selected = new Set(filters.customAttributes?.[group.slug] ?? []);
                    const searchTerm = customAttrSearch[group.slug] ?? '';
                    const filteredAttrs = searchTerm
                        ? group.attributes.filter((a) =>
                            a.label.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                        : group.attributes;
                    // Long lists (designer, assortment, wheel-type) get a search input; short ones don't.
                    const showSearch = group.attributes.length > 15;
                    return (
                        <div key={group.slug} className="py-3 px-4">
                            <Button variant="secondary" onClick={() => toggleSection(sectionKey)}
                                className="flex items-center justify-between w-full text-left">
                                <span className="font-medium text-heading">
                                    {group.name}
                                    {selected.size > 0 && (
                                        <span className="ml-2 px-1.5 py-0.5 bg-primary-500 text-inverted text-xs font-bold rounded-sm">
                                            {selected.size}
                                        </span>
                                    )}
                                </span>
                                {isCollapsed ? (
                                    <ChevronDownIcon className="w-5 h-5 text-subtle" />
                                ) : (
                                    <ChevronUpIcon className="w-5 h-5 text-subtle" />
                                )}
                            </Button>
                            {!isCollapsed && (
                                <div className="mt-3">
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
                                                <label
                                                    key={attr.slug}
                                                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected
                                                        ? 'bg-primary-100 text-primary-700'
                                                        : 'text-body hover:bg-surface'
                                                        }`}
                                                >
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
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Durum */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('condition')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {t('product.condition')}
                        </span>
                        {collapsedSections.condition ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.condition && (
                        <div className="mt-3 space-y-1">
                            {CONDITIONS.map((condition) => (
                                <label
                                    key={condition.value}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${filters.condition === condition.value
                                        ? 'bg-primary-100 text-primary-700'
                                        : 'text-body hover:bg-surface'
                                        }`}
                                >
                                    <Radio name="condition"
                                        checked={filters.condition === condition.value}
                                        onChange={() => handleConditionChange(condition.value)}
                                        className="w-4 h-4 text-primary-500 focus:ring-primary-400" />
                                    <span className="text-sm">{condition.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Fiyat */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('price')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Price' : 'Fiyat'}
                        </span>
                        {collapsedSections.price ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.price && (
                        <div className="mt-3 space-y-2">
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
                            {/* Quick price buttons */}
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
                    )}
                </div>

                {/* Diğer Seçenekler */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('options')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-heading">
                            {locale === 'en' ? 'Options' : 'Seçenekler'}
                        </span>
                        {collapsedSections.options ? (
                            <ChevronDownIcon className="w-5 h-5 text-subtle" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-subtle" />
                        )}
                    </Button>
                    {!collapsedSections.options && (
                        <div className="mt-3">
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
