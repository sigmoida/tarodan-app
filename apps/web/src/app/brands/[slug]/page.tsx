'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, listingsApi } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';
import OptimizedImage from '@/components/OptimizedImage';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import { ArrowLeftIcon, GlobeAltIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

interface Brand {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    description?: string;
    website?: string;
    country?: string;
    foundedYear?: number;
    productCount: number;
}

interface CarModel {
    id: string;
    name: string;
    slug: string;
    brandId: string;
}

interface Product {
    id: string;
    title: string;
    price: number;
    oldPrice?: number;
    isOnSale?: boolean;
    discountPercent?: number;
    images?: Array<{ url: string }> | string[];
    isPreorder?: boolean;
    isLimited?: boolean;
    editionNumber?: string;
    condition?: string;
    seller?: { displayName: string };
    status: string;
}

const countryFlags: Record<string, string> = {
    'Germany': '🇩🇪', 'Italy': '🇮🇹', 'France': '🇫🇷', 'Japan': '🇯🇵',
    'USA': '🇺🇸', 'China': '🇨🇳', 'Hong Kong': '🇭🇰', 'Thailand': '🇹🇭', 'UK': '🇬🇧',
};

const conditionLabels: Record<string, string> = {
    'new': 'Sıfır',
    'used': 'İkinci El',
    'as_new': 'Yeni Gibi',
};

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 100 }
    }
};

export default function BrandDetailPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const { t } = useTranslation();
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

    const brandQuery = useQuery({
        queryKey: ['brand', slug],
        queryFn: async () => {
            const res = await api.get(`/brands/${slug}`);
            return res.data as Brand;
        },
        enabled: !!slug,
    });

    const modelsQuery = useQuery({
        queryKey: ['brand-models', slug],
        queryFn: async () => {
            const res = await api.get('/car-models', { params: { brand: slug } });
            return res.data as CarModel[];
        },
        enabled: !!slug,
    });

    const productsQuery = useQuery({
        queryKey: ['brand-products', slug, selectedModelId],
        queryFn: async () => {
            const params: any = {
                brandId: brandQuery.data?.id, // Use ID for precise filtering
                limit: 50
            };
            if (selectedModelId) {
                params.carModelId = selectedModelId;
            }
            const res = await listingsApi.getAll(params);
            return res.data?.data || res.data?.products || [];
        },
        enabled: !!brandQuery.data?.name,
    });

    const brand = brandQuery.data;
    const models = modelsQuery.data ?? [];
    const products: Product[] = productsQuery.data ?? [];

    const getImageUrl = (img: any) => {
        if (!img) return 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
        if (typeof img === 'string') return img;
        return img.url;
    };

    if (brandQuery.isLoading) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin mb-6" />
                <p className="text-gray-400 font-medium tracking-widest uppercase text-sm">{t('common.loading')}</p>
            </div>
        );
    }

    if (!brand) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 text-center">
                <div className="text-9xl mb-4 opacity-10 font-black">404</div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Marka Bulunamadı</h2>
                <Link href="/brands" className="mt-8 px-8 py-3 bg-gray-900 text-white rounded-full font-bold hover:bg-orange-600 transition-all shadow-lg hover:shadow-orange-500/25">
                    Tüm Markalara Dön
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-24 pt-8">
            <div className="container mx-auto px-4 max-w-7xl">
                {/* Navigation Breadcrumb */}
                <Link href="/brands" className="inline-flex items-center gap-2 text-gray-400 hover:text-orange-600 font-medium mb-8 transition-colors group">
                    <ArrowLeftIcon className="h-4 w-4 transform group-hover:-translate-x-1 transition-transform" />
                    {t('brands.backToAll') || 'Tüm Markalar'}
                </Link>

                {/* Hero / Brand Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 border border-white/60 mb-12 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-orange-50 via-white to-transparent rounded-full -translate-y-1/2 translate-x-1/2 opacity-60 pointer-events-none" />

                    <div className="relative p-10 md:p-14 flex flex-col md:flex-row gap-12 items-center md:items-start text-center md:text-left">
                        {/* Logo Container */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="w-40 h-40 bg-white rounded-[2rem] shadow-lg border border-gray-100 flex items-center justify-center p-6 shrink-0 relative z-10"
                        >
                            {brand.logo ? (
                                <img src={brand.logo} alt={brand.name} className="max-w-full max-h-full object-contain" />
                            ) : (
                                <span className="text-6xl font-black text-gray-200 uppercase">{brand.name[0]}</span>
                            )}
                        </motion.div>

                        <div className="flex-1 relative z-10">
                            <div className="flex flex-wrap items-center gap-3 mb-4 justify-center md:justify-start">
                                {brand.country && (
                                    <span className="bg-gray-100/80 backdrop-blur-sm text-gray-600 text-sm font-bold px-4 py-1.5 rounded-full border border-gray-200/50 flex items-center gap-2">
                                        {countryFlags[brand.country] || '🌍'} {brand.country}
                                    </span>
                                )}
                                {brand.foundedYear && (
                                    <span className="bg-gray-100/80 backdrop-blur-sm text-gray-600 text-sm font-bold px-4 py-1.5 rounded-full border border-gray-200/50 flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4" />
                                        {brand.foundedYear}
                                    </span>
                                )}
                            </div>

                            <h1 className="text-5xl md:text-6xl font-black text-gray-900 mb-6 tracking-tight leading-[0.9]">
                                {brand.name}
                            </h1>

                            {brand.description && (
                                <p className="text-gray-500 text-lg leading-relaxed max-w-3xl mb-8">
                                    {brand.description}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                                {brand.website && (
                                    <a
                                        href={brand.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-full text-gray-700 font-bold hover:bg-gray-50 hover:text-orange-600 transition-colors shadow-sm"
                                    >
                                        <GlobeAltIcon className="h-5 w-5" />
                                        Web Sitesi
                                    </a>
                                )}
                                <div className="bg-orange-50 text-orange-700 font-bold px-6 py-3 rounded-full border border-orange-100 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                    {brand.productCount} {t('brands.products') || 'Aktif İlan'}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Models Filter Section */}
                {models.length > 0 && (
                    <div className="mb-12">
                        <div className="flex items-center justify-between mb-6 px-2">
                            <h3 className="text-xl font-bold text-gray-900">Modeller</h3>
                            {selectedModelId && (
                                <button
                                    onClick={() => setSelectedModelId(null)}
                                    className="text-sm font-bold text-orange-600 hover:underline"
                                >
                                    Filtreyi Temizle
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => setSelectedModelId(null)}
                                className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all duration-300 ${selectedModelId === null
                                    ? 'bg-gray-900 text-white shadow-lg shadow-gray-900/20'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
                                    }`}
                            >
                                Tümü
                            </button>

                            {models.map((model) => (
                                <button
                                    key={model.id}
                                    onClick={() => setSelectedModelId(selectedModelId === model.id ? null : model.id)}
                                    className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all duration-300 ${selectedModelId === model.id
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                                        : 'bg-white text-gray-600 hover:bg-orange-50 hover:text-orange-600 border border-gray-100'
                                        }`}
                                >
                                    {model.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Products Grid */}
                <div>
                    <div className="flex items-end justify-between mb-8 px-2">
                        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                            {selectedModelId ? `${models.find(m => m.id === selectedModelId)?.name} İlanları` : 'Tüm İlanlar'}
                        </h2>
                        <span className="text-gray-400 font-medium text-sm">
                            {products.length} sonuç gösteriliyor
                        </span>
                    </div>

                    {productsQuery.isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <div key={n} className="bg-white rounded-3xl h-[400px] animate-pulse" />
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white rounded-[2.5rem] border border-gray-100 p-24 text-center shadow-sm"
                        >
                            <div className="text-7xl mb-6 opacity-20">🏎️</div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-3">{t('brands.noProducts') || 'İlan Bulunamadı'}</h3>
                            <p className="text-gray-500 max-w-md mx-auto mb-8">
                                {selectedModelId
                                    ? 'Seçilen model için şu an aktif ilan bulunmuyor.'
                                    : 'Bu markaya ait henüz bir ilan eklenmemiş.'}
                            </p>
                            <Link href="/listings/new" className="inline-block px-10 py-4 bg-gray-900 text-white rounded-full font-bold shadow-xl shadow-gray-900/10 hover:bg-orange-600 hover:shadow-orange-500/30 transition-all transform hover:-translate-y-1">
                                İlan Veren İlk Kişi Ol
                            </Link>
                        </motion.div>
                    ) : (
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                        >
                            <AnimatePresence mode='wait'>
                                {products.map((product) => {
                                    const isSale = isProductOnSaleDisplay(product);
                                    const effectivePrice = getProductEffectivePrice(product);
                                    const originalPrice = getProductOriginalPriceForDisplay(product);

                                    return (
                                        <motion.div key={product.id} variants={itemVariants} layout>
                                            <Link
                                                href={`/listings/${product.id}`}
                                                className="group block bg-white rounded-[1.5rem] p-3 h-full border border-gray-100 hover:border-orange-100/50 hover:shadow-2xl hover:shadow-gray-200/50 transition-all duration-500 relative overflow-hidden"
                                            >
                                                {/* Image Area */}
                                                <div className="aspect-[4/3] relative bg-gray-50 rounded-[1.2rem] overflow-hidden mb-4">
                                                    <OptimizedImage
                                                        src={getImageUrl(product.images?.[0])}
                                                        alt={product.title}
                                                        fill
                                                        className="object-cover group-hover:scale-110 transition-transform duration-700"
                                                        fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                                                    />

                                                    {/* Status Badges */}
                                                    <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
                                                        {product.isPreorder && (
                                                            <span className="bg-white/90 backdrop-blur text-amber-600 text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm border border-amber-100">ÖN SİPARİŞ</span>
                                                        )}
                                                        {product.isLimited && (
                                                            <span className="bg-gray-900/90 backdrop-blur text-white text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm">LIMITED</span>
                                                        )}
                                                        {product.status === 'sold' && (
                                                            <span className="bg-red-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm">SATILDI</span>
                                                        )}
                                                    </div>

                                                    {isSale && product.discountPercent && (
                                                        <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-black px-2 py-1 rounded-md shadow-sm z-10">
                                                            %{product.discountPercent}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="px-2 pb-2">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                            {product.condition ? (conditionLabels[product.condition] || product.condition) : 'Bilinmiyor'}
                                                        </span>
                                                        {product.seller?.displayName && (
                                                            <span className="text-[10px] font-medium text-gray-400 truncate max-w-[80px]">@{product.seller.displayName}</span>
                                                        )}
                                                    </div>

                                                    <h3 className="font-bold text-gray-900 text-sm mb-3 line-clamp-2 leading-snug group-hover:text-orange-600 transition-colors h-10">
                                                        {product.title}
                                                    </h3>

                                                    <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                                                        <div className="flex flex-col">
                                                            {isSale ? (
                                                                <>
                                                                    <span className="text-xs text-gray-400 line-through decoration-red-400">₺{originalPrice.toLocaleString('tr-TR')}</span>
                                                                    <span className="text-lg font-black text-gray-900">₺{effectivePrice.toLocaleString('tr-TR')}</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-lg font-black text-gray-900">₺{effectivePrice.toLocaleString('tr-TR')}</span>
                                                            )}
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-500 group-hover:text-white transition-all duration-300">
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>
            </div>

            <style jsx global>{`
                ::selection {
                    background-color: #ffedd5;
                    color: #9a3412;
                }
            `}</style>
        </div>
    );
}
