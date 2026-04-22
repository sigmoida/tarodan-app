'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@/i18n/LanguageContext';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button, Input, Select, Spinner } from '@tarodan/ui';
import axios from 'axios';

interface Brand {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    country: string | null;
}

interface CarModel {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    description: string | null;
    yearStart: number | null;
    yearEnd: number | null;
    brand: Brand;
    productCount: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const countryFlags: Record<string, string> = {
    Germany: '🇩🇪', Japan: '🇯🇵', Italy: '🇮🇹', USA: '🇺🇸', France: '🇫🇷',
    'United Kingdom': '🇬🇧', China: '🇨🇳', 'Hong Kong': '🇭🇰', Thailand: '🇹🇭',
    Sweden: '🇸🇪', 'South Korea': '🇰🇷',
};

export default function ModelsPage() {
    const { t } = useTranslation();
    const [models, setModels] = useState<CarModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedBrand, setSelectedBrand] = useState<string>('all');

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await axios.get(`${API}/car-models`);
                setModels(res.data);
            } catch (e) {
                console.error('Failed to fetch car models:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchModels();
    }, []);

    const brands = useMemo(() => {
        const map = new Map<string, Brand>();
        models.forEach((m) => {
            if (!map.has(m.brand.slug)) map.set(m.brand.slug, m.brand);
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [models]);

    const filtered = useMemo(() => {
        return models.filter((m) => {
            const matchBrand = selectedBrand === 'all' || m.brand.slug === selectedBrand;
            const matchSearch =
                !search ||
                m.name.toLowerCase().includes(search.toLowerCase()) ||
                m.brand.name.toLowerCase().includes(search.toLowerCase());
            return matchBrand && matchSearch;
        });
    }, [models, search, selectedBrand]);

    const grouped = useMemo(() => {
        const map = new Map<string, { brand: Brand; models: CarModel[] }>();
        filtered.forEach((m) => {
            if (!map.has(m.brand.slug)) {
                map.set(m.brand.slug, { brand: m.brand, models: [] });
            }
            map.get(m.brand.slug)!.models.push(m);
        });
        return Array.from(map.values()).sort((a, b) => a.brand.name.localeCompare(b.brand.name));
    }, [filtered]);

    return (
        <div className="min-h-screen bg-surface pb-12 pt-8">
            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-extrabold text-heading mb-3 tracking-tight">
                        {t('models.title')}
                    </h1>
                    <p className="text-muted text-lg max-w-2xl mx-auto">
                        {t('models.subtitle')}
                    </p>
                </div>

                {/* Search & Filters */}
                <div className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle p-6 mb-10">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full md:max-w-md">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </span>
                            <Input type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('models.searchPlaceholder')}
                                className="pl-12 pr-4 py-3 bg-surface border-border rounded-xl outline-none transition-all text-body placeholder-subtle" />
                        </div>

                        <div className="flex gap-3 w-full md:w-auto">
                            <Select
                                value={selectedBrand}
                                onChange={(e) => setSelectedBrand(e.target.value)}
                                className="w-full md:w-48 bg-surface rounded-xl cursor-pointer font-medium"
                            >
                                <option value="all">{t('models.allBrands')}</option>
                                {brands.map((b) => (
                                    <option key={b.slug} value={b.slug}>
                                        {b.name}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Spinner size="xl" color="border-primary-100 border-t-primary-500" className="mb-4" />
                        <p className="text-muted font-medium">{t('common.loading')}</p>
                    </div>
                )}

                {/* No Results */}
                {!loading && filtered.length === 0 && (
                    <div className="bg-surface-elevated rounded-2xl border border-border-subtle p-16 text-center shadow-sm">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-surface rounded-full mb-4">
                            <MagnifyingGlassIcon className="w-8 h-8 text-subtle" />
                        </div>
                        <h3 className="text-xl font-bold text-heading mb-2">{t('models.noResults')}</h3>
                        <p className="text-muted">{t('models.searchNoResultDesc') || 'Lütfen farklı bir arama yapmayı deneyin.'}</p>
                        <Button variant="secondary" onClick={() => { setSearch(''); setSelectedBrand('all'); }}
                            className="mt-6 px-6 py-2 bg-primary-500 text-inverted rounded-lg hover:bg-primary-600 transition-colors">
                            {t('common.clearFilters') || 'Filtreleri Temizle'}
                        </Button>
                    </div>
                )}

                {/* Grouped Content */}
                {!loading && grouped.map(({ brand, models: brandModels }, gi) => (
                    <div key={brand.slug} className="mb-12">
                        {/* Brand Section Header */}
                        <div className="flex items-center justify-between mb-6 pb-2 border-b border-border-subtle">
                            <Link
                                href={`/brands/${brand.slug}`}
                                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                            >
                                <div className="w-10 h-10 bg-surface-elevated border border-border rounded-lg p-1.5 flex items-center justify-center shadow-sm overflow-hidden">
                                    {brand.logo ? (
                                        <img src={brand.logo} alt={brand.name} className="max-w-full max-h-full object-contain" />
                                    ) : (
                                        <span className="text-lg font-bold text-primary-500">{brand.name[0]}</span>
                                    )}
                                </div>
                                <h2 className="text-2xl font-bold text-heading flex items-center gap-2">
                                    {brand.country && countryFlags[brand.country] && (
                                        <span className="text-xl">{countryFlags[brand.country]}</span>
                                    )}
                                    {brand.name}
                                </h2>
                            </Link>
                            <span className="bg-primary-50 text-primary-600 px-3 py-1 rounded-full text-sm font-semibold border border-primary-100">
                                {brandModels.length} {t('models.model')}
                            </span>
                        </div>

                        {/* Models Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {brandModels.map((m, mi) => (
                                <Link
                                    key={m.id}
                                    href={`/models/${m.slug}`}
                                    className="group bg-surface-elevated rounded-2xl border border-border-subtle p-5 hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col h-full"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 bg-surface group-hover:bg-primary-50 rounded-xl flex items-center justify-center text-2xl transition-colors">
                                            🏎️
                                        </div>
                                        {m.productCount > 0 && (
                                            <span className="bg-success-50 text-success-600 text-xs font-bold px-2.5 py-1 rounded-lg border border-success-100 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse" />
                                                {m.productCount} {t('models.listings')}
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="text-lg font-bold text-heading group-hover:text-primary-600 transition-colors mb-1">
                                        {m.name}
                                    </h3>

                                    {m.yearStart && (
                                        <p className="text-primary-500 text-xs font-bold mb-3 tracking-wide">
                                            {m.yearStart} {m.yearEnd ? `- ${m.yearEnd}` : `- ${t('models.present')}`}
                                        </p>
                                    )}

                                    {m.description && (
                                        <p className="text-muted text-sm line-clamp-2 leading-relaxed flex-grow">
                                            {m.description}
                                        </p>
                                    )}

                                    <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between text-subtle group-hover:text-primary-500 transition-colors">
                                        <span className="text-xs font-semibold">{t('models.viewDetails') || 'Detayları Gör'}</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
