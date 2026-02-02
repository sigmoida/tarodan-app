'use client';

import { useState, useEffect } from 'react';
import {
    FunnelIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

interface FilterSection {
    id: string;
    title: string;
    type: 'checkbox' | 'radio' | 'range';
    options?: { value: string; label: string; count?: number }[];
    items?: string[];
}

interface SidebarFiltersProps {
    filters: {
        brand: string;
        scale: string;
        condition: string;
        minPrice: string;
        maxPrice: string;
        tradeOnly: boolean;
        category?: string;
        manufacturer?: string;
    };
    onFilterChange: (filters: any) => void;
    activeFilterCount: number;
    onClearFilters: () => void;
}

// Genişletilmiş kategoriler
const VEHICLE_CATEGORIES = [
    { value: 'arabalar', label: 'Arabalar', labelEn: 'Cars' },
    { value: 'motosikletler', label: 'Motosikletler', labelEn: 'Motorcycles' },
    { value: 'motorsports', label: 'Motorsports', labelEn: 'Motorsports' },
    { value: 'acil-durum', label: 'Acil Durum Araçları', labelEn: 'Emergency Vehicles' },
    { value: 'ticari', label: 'Ticari Araçlar', labelEn: 'Commercial' },
    { value: 'insaat', label: 'İnşaat Araçları', labelEn: 'Construction' },
    { value: 'tarim', label: 'Tarım Araçları', labelEn: 'Agriculture' },
    { value: 'askeri', label: 'Askeri Araçlar', labelEn: 'Military' },
    { value: 'gemiler', label: 'Gemiler', labelEn: 'Ships' },
    { value: 'trenler', label: 'Trenler', labelEn: 'Trains' },
    { value: 'ucaklar', label: 'Uçaklar', labelEn: 'Aircrafts' },
    { value: 'setler', label: 'Setler', labelEn: 'Sets' },
];

// Genişletilmiş markalar
const BRANDS = [
    'Audi', 'Alfa Romeo', 'BMW', 'Chevrolet', 'Dodge', 'Ferrari', 'Ford',
    'Honda', 'Jaguar', 'Lamborghini', 'Land Rover', 'Maserati', 'McLaren',
    'Mercedes-Benz', 'Nissan', 'Porsche', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen',
];

// Genişletilmiş ölçekler
const SCALES = [
    '1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36',
    '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200',
];

// Üreticiler
const MANUFACTURERS = [
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

    // Collapsed state for each section
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
        category: false,
        brand: false,
        scale: false,
        manufacturer: false,
        condition: false,
        price: false,
        options: false,
    });

    // Search within filters
    const [brandSearch, setBrandSearch] = useState('');
    const [manufacturerSearch, setManufacturerSearch] = useState('');

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

    const handleBrandChange = (brand: string) => {
        onFilterChange({
            ...filters,
            brand: filters.brand === brand ? '' : brand,
        });
    };

    const handleScaleChange = (scale: string) => {
        onFilterChange({
            ...filters,
            scale: filters.scale === scale ? '' : scale,
        });
    };

    const handleConditionChange = (condition: string) => {
        onFilterChange({
            ...filters,
            condition: filters.condition === condition ? '' : condition,
        });
    };

    const handleManufacturerChange = (manufacturer: string) => {
        onFilterChange({
            ...filters,
            manufacturer: filters.manufacturer === manufacturer ? '' : manufacturer,
        });
    };

    const handleCategoryChange = (category: string) => {
        onFilterChange({
            ...filters,
            category: filters.category === category ? '' : category,
        });
    };

    const filteredBrands = BRANDS.filter(brand =>
        brand.toLowerCase().includes(brandSearch.toLowerCase())
    );

    const filteredManufacturers = MANUFACTURERS.filter(m =>
        m.toLowerCase().includes(manufacturerSearch.toLowerCase())
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-h-[calc(100vh-150px)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <FunnelIcon className="w-5 h-5 text-gray-600" />
                    <span className="font-semibold text-gray-900">{t('product.filters')}</span>
                    {activeFilterCount > 0 && (
                        <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full">
                            {activeFilterCount}
                        </span>
                    )}
                </div>
                {activeFilterCount > 0 && (
                    <button
                        onClick={onClearFilters}
                        className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                    >
                        <XMarkIcon className="w-4 h-4" />
                        {t('product.clearFilters')}
                    </button>
                )}
            </div>

            {/* Filter Sections */}
            <div className="divide-y divide-gray-100 overflow-y-auto flex-1">

                {/* Kategori */}
                <div className="py-3 px-4">
                    <button
                        onClick={() => toggleSection('category')}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Category' : 'Kategori'}
                        </span>
                        {collapsedSections.category ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </button>
                    {!collapsedSections.category && (
                        <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                            {VEHICLE_CATEGORIES.map((cat) => (
                                <button
                                    key={cat.value}
                                    onClick={() => handleCategoryChange(cat.value)}
                                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm transition-colors ${filters.category === cat.value
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    <span>{locale === 'en' ? cat.labelEn : cat.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Marka */}
                <div className="py-3 px-4">
                    <button
                        onClick={() => toggleSection('brand')}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Brand' : 'Marka'}
                        </span>
                        {collapsedSections.brand ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </button>
                    {!collapsedSections.brand && (
                        <div className="mt-3">
                            <input
                                type="text"
                                placeholder={locale === 'en' ? 'Search brands...' : 'Marka ara...'}
                                value={brandSearch}
                                onChange={(e) => setBrandSearch(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400 mb-2"
                            />
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {filteredBrands.map((brand) => (
                                    <label
                                        key={brand}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${filters.brand === brand
                                            ? 'bg-orange-100 text-orange-700'
                                            : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={filters.brand === brand}
                                            onChange={() => handleBrandChange(brand)}
                                            className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400"
                                        />
                                        <span className="text-sm">{brand}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Ölçek */}
                <div className="py-3 px-4">
                    <button
                        onClick={() => toggleSection('scale')}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Scale' : 'Ölçek'}
                        </span>
                        {collapsedSections.scale ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </button>
                    {!collapsedSections.scale && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {SCALES.map((scale) => (
                                <button
                                    key={scale}
                                    onClick={() => handleScaleChange(scale)}
                                    className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${filters.scale === scale
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {scale}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Üretici */}
                <div className="py-3 px-4">
                    <button
                        onClick={() => toggleSection('manufacturer')}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Manufacturer' : 'Üretici'}
                        </span>
                        {collapsedSections.manufacturer ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </button>
                    {!collapsedSections.manufacturer && (
                        <div className="mt-3">
                            <input
                                type="text"
                                placeholder={locale === 'en' ? 'Search manufacturers...' : 'Üretici ara...'}
                                value={manufacturerSearch}
                                onChange={(e) => setManufacturerSearch(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400 mb-2"
                            />
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {filteredManufacturers.map((manufacturer) => (
                                    <label
                                        key={manufacturer}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${filters.manufacturer === manufacturer
                                            ? 'bg-orange-100 text-orange-700'
                                            : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={filters.manufacturer === manufacturer}
                                            onChange={() => handleManufacturerChange(manufacturer)}
                                            className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400"
                                        />
                                        <span className="text-sm">{manufacturer}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Durum */}
                <div className="py-3 px-4">
                    <button
                        onClick={() => toggleSection('condition')}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="font-medium text-gray-900">
                            {t('product.condition')}
                        </span>
                        {collapsedSections.condition ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </button>
                    {!collapsedSections.condition && (
                        <div className="mt-3 space-y-1">
                            {CONDITIONS.map((condition) => (
                                <label
                                    key={condition.value}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${filters.condition === condition.value
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="condition"
                                        checked={filters.condition === condition.value}
                                        onChange={() => handleConditionChange(condition.value)}
                                        className="w-4 h-4 text-orange-500 border-gray-300 focus:ring-orange-400"
                                    />
                                    <span className="text-sm">{condition.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Fiyat */}
                <div className="py-3 px-4">
                    <button
                        onClick={() => toggleSection('price')}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Price' : 'Fiyat'}
                        </span>
                        {collapsedSections.price ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </button>
                    {!collapsedSections.price && (
                        <div className="mt-3 space-y-2">
                            <div className="flex gap-2 items-center">
                                <input
                                    type="number"
                                    placeholder="Min ₺"
                                    value={filters.minPrice}
                                    onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value })}
                                    className="flex-1 min-w-0 w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400"
                                />
                                <span className="text-gray-400 flex-shrink-0">-</span>
                                <input
                                    type="number"
                                    placeholder="Max ₺"
                                    value={filters.maxPrice}
                                    onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value })}
                                    className="flex-1 min-w-0 w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400"
                                />
                            </div>
                            {/* Quick price buttons */}
                            <div className="flex flex-wrap gap-1">
                                {['0-100', '100-500', '500-1000', '1000+'].map((range) => {
                                    const [min, max] = range.split('-');
                                    const isActive = filters.minPrice === (min || '') && filters.maxPrice === (max || '');
                                    return (
                                        <button
                                            key={range}
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
                                            className={`px-2 py-1 text-xs rounded-md transition-colors ${isActive
                                                ? 'bg-orange-500 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {range === '1000+' ? '₺1000+' : `₺${range}`}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Diğer Seçenekler */}
                <div className="py-3 px-4">
                    <button
                        onClick={() => toggleSection('options')}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <span className="font-medium text-gray-900">
                            {locale === 'en' ? 'Options' : 'Seçenekler'}
                        </span>
                        {collapsedSections.options ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        )}
                    </button>
                    {!collapsedSections.options && (
                        <div className="mt-3">
                            <label className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={filters.tradeOnly}
                                    onChange={(e) => onFilterChange({ ...filters, tradeOnly: e.target.checked })}
                                    className="w-5 h-5 text-orange-500 border-gray-300 rounded focus:ring-orange-400"
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
