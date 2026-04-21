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
            onFilterChange({ ...filters, manufacturerId: '', manufacturer: '' });
        } else {
            onFilterChange({ ...filters, manufacturerId, manufacturer: manufacturerName });
        }
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
        <div className="bg-white rounded shadow-sm border border-gray-100 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <FunnelIcon className="w-5 h-5 text-gray-600" />
                    <span className="font-semibold text-gray-900">{t('product.filters')}</span>
                    {activeFilterCount > 0 && (
                        <span className="px-2 py-0.5 bg-primary-500 text-white text-xs font-bold rounded-sm">
                            {activeFilterCount}
                        </span>
                    )}
                </div>
            </div>

            {/* Filter Sections */}
            <div className="divide-y divide-gray-100">

                {/* Araç Türü (Category) - loaded from API */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('category')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Vehicle Type' : 'Araç Türü'}
                        </span>
                        {collapsedSections.category ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </Button>
                    {!collapsedSections.category && (
                        <div className="mt-3 space-y-1">
                            {categories.map((cat) => (
                                <Button variant="secondary" key={cat.id}
                                    onClick={() => handleCategoryChange(cat.id, cat.name)}
                                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors ${filters.categoryId === cat.id
                                        ? 'bg-primary-100 text-primary-700'
                                        : 'text-gray-700 hover:bg-gray-50'
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
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Brand' : 'Marka'}
                        </span>
                        {collapsedSections.brand ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
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
                                className="rounded border-gray-200 focus:border-primary-400 mb-2"
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
                                                : 'text-gray-700 hover:bg-gray-50'
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
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Model' : 'Model'}
                        </span>
                        {collapsedSections.model ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
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
                                className="rounded border-gray-200 focus:border-primary-400 mb-2"
                            />
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                {modelsForBrand.map((m) => {
                                    const isSelected = filters.carModelId === m.id;
                                    return (
                                        <label
                                            key={m.id}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected
                                                ? 'bg-primary-100 text-primary-700'
                                                : 'text-gray-700 hover:bg-gray-50'
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
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Scale' : 'Ölçek'}
                        </span>
                        {collapsedSections.scale ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </Button>
                    {!collapsedSections.scale && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {(scaleList.length > 0 ? scaleList : ['1:18', '1:24', '1:43', '1:64', '1:87']).map((scale) => (
                                <Button variant="secondary" key={scale}
                                    onClick={() => handleScaleChange(scale)}
                                    className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${filters.scale === scale
                                        ? 'bg-primary-500 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Material' : 'Malzeme'}
                        </span>
                        {collapsedSections.material ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
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
                                        : 'text-gray-700 hover:bg-gray-50'
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
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Manufacturer' : 'Üretici'}
                        </span>
                        {collapsedSections.manufacturer ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
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
                                className="rounded border-gray-200 focus:border-primary-400 mb-2"
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
                                                : 'text-gray-700 hover:bg-gray-50'
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

                {/* Durum */}
                <div className="py-3 px-4">
                    <Button variant="secondary" onClick={() => toggleSection('condition')}
                        className="flex items-center justify-between w-full text-left">
                        <span className="font-medium text-gray-900">
                            {t('product.condition')}
                        </span>
                        {collapsedSections.condition ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </Button>
                    {!collapsedSections.condition && (
                        <div className="mt-3 space-y-1">
                            {CONDITIONS.map((condition) => (
                                <label
                                    key={condition.value}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${filters.condition === condition.value
                                        ? 'bg-primary-100 text-primary-700'
                                        : 'text-gray-700 hover:bg-gray-50'
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
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Price' : 'Fiyat'}
                        </span>
                        {collapsedSections.price ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
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
                                    className="flex-1 min-w-0 px-2 rounded border-gray-200 focus:border-primary-400"
                                />
                                <span className="text-gray-400 flex-shrink-0">-</span>
                                <Input
                                    type="number"
                                    placeholder="Max ₺"
                                    value={filters.maxPrice}
                                    onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value })}
                                    inputSize="sm"
                                    className="flex-1 min-w-0 px-2 rounded border-gray-200 focus:border-primary-400"
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
                                                ? 'bg-primary-500 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Options' : 'Seçenekler'}
                        </span>
                        {collapsedSections.options ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </Button>
                    {!collapsedSections.options && (
                        <div className="mt-3">
                            <label className="flex items-center gap-3 px-2 py-2 rounded cursor-pointer hover:bg-gray-50">
                                <Checkbox
                                    checked={filters.tradeOnly}
                                    onChange={(e) => onFilterChange({ ...filters, tradeOnly: e.target.checked })}
                                    className="h-5 w-5"
                                />
                                <div>
                                    <span className="text-sm font-medium text-gray-700">{t('product.tradeAvailable')}</span>
                                    <p className="text-xs text-gray-500">
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
