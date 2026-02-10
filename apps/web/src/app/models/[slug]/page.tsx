'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/LanguageContext';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import axios from 'axios';

interface Brand {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    country: string | null;
}

interface CarModelDetail {
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

interface Product {
    id: string;
    title: string;
    price: number;
    originalPrice?: number;
    salePrice?: number;
    images: { url: string }[];
    condition: string;
    isPreorder?: boolean;
    isLimited?: boolean;
    editionNumber?: string;
    seller?: { displayName: string };
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const conditionLabels: Record<string, string> = {
    new: 'Sıfır',
    like_new: 'Az Kullanılmış',
    very_good: 'Çok İyi',
    good: 'İyi',
    fair: 'Orta',
    used: 'Kullanılmış',
};

export default function ModelDetailPage() {
    const { t } = useTranslation();
    const params = useParams();
    const slug = params?.slug as string;

    const [model, setModel] = useState<CarModelDetail | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!slug) return;
        const fetchData = async () => {
            try {
                setLoading(true);
                const [modelRes, productsRes] = await Promise.all([
                    axios.get(`${API}/car-models/${slug}`),
                    axios.get(`${API}/listings`, {
                        params: { carModel: slug, limit: 50 },
                    }).catch(() => ({ data: { items: [] } })),
                ]);
                setModel(modelRes.data);
                setProducts(productsRes.data?.items || productsRes.data || []);
            } catch (e) {
                console.error('Failed to fetch model:', e);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [slug]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin mb-4" />
                <p className="text-gray-500 font-medium">{t('common.loading')}</p>
            </div>
        );
    }

    if (error || !model) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="text-6xl mb-4">😔</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('models.notFound')}</h2>
                <Link href="/models" className="mt-4 text-primary-600 font-semibold flex items-center gap-2 hover:underline">
                    ← {t('models.backToAll')}
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-12 pt-8">
            <div className="container mx-auto px-4">
                {/* Navigation Breadcrumb-ish */}
                <Link href="/models" className="inline-flex items-center gap-2 text-gray-500 hover:text-primary-600 font-medium mb-6 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {t('models.backToAll')}
                </Link>

                {/* Hero / Header Section */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-10">
                    <div className="relative h-48 bg-gradient-to-r from-primary-500 to-orange-400 opacity-10 absolute inset-0 w-full" />
                    <div className="relative p-8 md:p-12 flex flex-col md:flex-row gap-10 items-center md:items-start text-center md:text-left">
                        <div className="w-32 h-32 bg-white rounded-2xl shadow-md border border-gray-100 flex items-center justify-center text-6xl shadow-primary-100">
                            🏎️
                        </div>

                        <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-3 mb-3 justify-center md:justify-start">
                                <Link
                                    href={`/brands/${model.brand.slug}`}
                                    className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full transition-colors"
                                >
                                    {model.brand.logo && (
                                        <img src={model.brand.logo} alt={model.brand.name} className="w-5 h-5 object-contain" />
                                    )}
                                    <span className="text-sm font-bold text-gray-700">{model.brand.name}</span>
                                </Link>

                                {model.yearStart && (
                                    <span className="bg-primary-50 text-primary-600 text-sm font-bold px-3 py-1.5 rounded-full border border-primary-100">
                                        📅 {model.yearStart} {model.yearEnd ? `- ${model.yearEnd}` : `- ${t('models.present')}`}
                                    </span>
                                )}
                            </div>

                            <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4 tracking-tight">
                                {model.name}
                            </h1>

                            {model.description && (
                                <p className="text-gray-500 text-lg leading-relaxed max-w-3xl mb-6">
                                    {model.description}
                                </p>
                            )}

                            <div className="flex gap-4">
                                <div className="bg-green-50 text-green-700 font-bold px-4 py-2 rounded-xl border border-green-100 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                    {model.productCount} {t('models.listings')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Listings Section */}
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">
                        {model.name} {t('models.productsTitle')}
                    </h2>
                    <p className="text-gray-500 mt-1">{t('models.listingsDiscoveryDesc') || 'Bu modele ait tüm aktif diecast ilanları'}</p>
                </div>

                {products.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-gray-100 p-20 text-center shadow-sm">
                        <div className="text-6xl mb-4 opacity-30">📦</div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('models.noProducts')}</h3>
                        <p className="text-gray-500 max-w-md mx-auto">{t('models.noProductsDesc') || 'Şu an bu model için aktif bir ilan bulunmuyor. Kendi ilanınızı vererek ilk satıcı olabilirsiniz!'}</p>
                        <Link href="/listings/new" className="mt-8 inline-block px-8 py-3 bg-primary-500 text-white rounded-xl font-bold shadow-lg shadow-primary-100 hover:bg-primary-600 transition-all transform hover:-translate-y-1">
                            {t('nav.createListing') || 'Hemen İlan Ver'}
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {products.map((p, i) => {
                            const img = p.images?.[0]?.url;
                            const hasDiscount = p.salePrice && p.originalPrice && Number(p.salePrice) < Number(p.originalPrice);

                            return (
                                <Link
                                    key={p.id}
                                    href={`/listings/${p.id}`}
                                    className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full"
                                >
                                    {/* Product Image */}
                                    <div className="relative pt-[75%] bg-gray-50 overflow-hidden">
                                        {img ? (
                                            <img src={img} alt={p.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-gray-200">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                        )}

                                        {/* Status Badges */}
                                        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                                            {p.isPreorder && (
                                                <span className="bg-amber-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm">
                                                    PRE-ORDER
                                                </span>
                                            )}
                                            {p.isLimited && (
                                                <span className="bg-purple-600 text-white text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm">
                                                    LIMITED
                                                </span>
                                            )}
                                        </div>

                                        {hasDiscount && (
                                            <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-black px-2 py-1 rounded-md shadow-sm">
                                                %{Math.round((1 - Number(p.salePrice) / Number(p.originalPrice)) * 100)} İndirim
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="p-4 flex flex-col flex-grow">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <span className="text-[10px] font-bold text-primary-500 uppercase tracking-wider">{conditionLabels[p.condition] || p.condition}</span>
                                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                                            {p.seller?.displayName && (
                                                <span className="text-[10px] font-medium text-gray-400 truncate max-w-[100px]">{p.seller.displayName}</span>
                                            )}
                                        </div>

                                        <h3 className="font-bold text-gray-800 text-sm mb-3 line-clamp-2 leading-tight group-hover:text-primary-600 transition-colors">
                                            {p.title}
                                        </h3>

                                        <div className="mt-auto pt-3 flex flex-col justify-end">
                                            <div className="flex items-center gap-2">
                                                {hasDiscount ? (
                                                    <>
                                                        <span className="text-lg font-black text-gray-900 leading-none">₺{Number(p.salePrice).toLocaleString('tr-TR')}</span>
                                                        <span className="text-xs text-gray-400 line-through decoration-red-400">₺{Number(p.originalPrice).toLocaleString('tr-TR')}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-lg font-black text-gray-900 leading-none">₺{Number(p.price).toLocaleString('tr-TR')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
