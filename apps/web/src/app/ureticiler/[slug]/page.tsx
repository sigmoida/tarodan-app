'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Spinner } from '@tarodan/ui';
import { listingsApi, manufacturersApi } from '@/lib/api';
import { countryToFlag } from '@/lib/countryFlag';
import { useTranslation } from '@/i18n/LanguageContext';
import OptimizedImage from '@/components/OptimizedImage';
import UserAvatar from '@/components/UserAvatar';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import { ArrowLeftIcon, GlobeAltIcon, CalendarIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
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
    seller?: { displayName: string; avatarUrl?: string };
    status: string;
}

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

export default function UreticiDetailPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const { t } = useTranslation();
    const brandQuery = useQuery({
        queryKey: ['manufacturer', slug],
        queryFn: async () => {
            const res = await manufacturersApi.findBySlug(slug);
            return res.data as Brand;
        },
        enabled: !!slug,
    });

    const productsQuery = useQuery({
        queryKey: ['manufacturer-products', slug],
        queryFn: async () => {
            const params: any = {
                manufacturerId: brandQuery.data?.id,
                limit: 50
            };
            const res = await listingsApi.getAll(params);
            const raw = res.data;
            return Array.isArray(raw) ? raw : (raw?.data ?? raw?.products ?? []);
        },
        enabled: !!brandQuery.data?.id,
    });

    const brand = brandQuery.data;
    const products: Product[] = productsQuery.data ?? [];

    const getImageUrl = (img: any) => {
        if (!img) return 'https://placehold.co/400x400?text=Ürün';
        if (typeof img === 'string') return img;
        return img.cardUrl ?? img.detailUrl ?? img.url;
    };

    if (brandQuery.isLoading) {
        return (
            <div className="min-h-screen bg-surface flex flex-col items-center justify-center">
                <Spinner size="2xl" color="border-primary-100 border-t-primary-500" className="mb-6" />
                <p className="text-subtle font-medium tracking-widest uppercase text-sm">{t('common.loading')}</p>
            </div>
        );
    }

    if (!brand) {
        return (
            <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 text-center">
                <div className="text-9xl mb-4 opacity-10 font-black">404</div>
                <h2 className="text-3xl font-bold text-heading mb-2">Üretici Bulunamadı</h2>
                <Link href="/ureticiler" className="mt-8 px-8 py-3 bg-heading text-inverted rounded-full font-bold hover:bg-primary-600 transition-all shadow-lg hover:shadow-primary-500/25">
                    Tüm Üreticilere Dön
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface pb-24 pt-8">
            <div className="container mx-auto px-4 max-w-7xl">
                {/* Navigation Breadcrumb */}
                <Link href="/ureticiler" className="inline-flex items-center gap-2 text-subtle hover:text-primary-600 font-medium mb-8 transition-colors group">
                    <ArrowLeftIcon className="h-4 w-4 transform group-hover:-translate-x-1 transition-transform" />
                    {t('brands.backToAll') || 'Tüm Üreticiler'}
                </Link>

                {/* Hero / Brand Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface-elevated rounded-[2.5rem] shadow-xl shadow-border/50 border border-surface-elevated/60 mb-12 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-primary-50 via-surface-elevated to-transparent rounded-full -translate-y-1/2 translate-x-1/2 opacity-60 pointer-events-none" />

                    <div className="relative p-10 md:p-14 flex flex-col md:flex-row gap-12 items-center md:items-start text-center md:text-left">
                        {/* Logo Container */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="w-40 h-40 bg-surface-elevated rounded-[2rem] shadow-lg border border-border-subtle flex items-center justify-center p-6 shrink-0 relative z-10"
                        >
                            {brand.logo ? (
                                <img src={brand.logo} alt={brand.name} className="max-w-full max-h-full object-contain" />
                            ) : (
                                <span className="text-6xl font-black text-border-subtle uppercase">{brand.name[0]}</span>
                            )}
                        </motion.div>

                        <div className="flex-1 relative z-10">
                            <div className="flex flex-wrap items-center gap-3 mb-4 justify-center md:justify-start">
                                {brand.country && (
                                    <span className="bg-surface-alt/80 backdrop-blur-sm text-muted text-sm font-bold px-4 py-1.5 rounded-full border border-border/50 flex items-center gap-2">
                                        {countryToFlag(brand.country) || '🌍'} {brand.country}
                                    </span>
                                )}
                                {brand.foundedYear && (
                                    <span className="bg-surface-alt/80 backdrop-blur-sm text-muted text-sm font-bold px-4 py-1.5 rounded-full border border-border/50 flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4" />
                                        {brand.foundedYear}
                                    </span>
                                )}
                            </div>

                            <h1 className="text-5xl md:text-6xl font-black text-heading mb-6 tracking-tight leading-[0.9]">
                                {brand.name}
                            </h1>

                            {brand.description && (
                                <p className="text-muted text-lg leading-relaxed max-w-3xl mb-8">
                                    {brand.description}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                                {brand.website && (
                                    <a
                                        href={brand.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-surface-elevated border border-border rounded-full text-body font-bold hover:bg-surface hover:text-primary-600 transition-colors shadow-sm"
                                    >
                                        <GlobeAltIcon className="h-5 w-5" />
                                        Web Sitesi
                                    </a>
                                )}
                                <div className="bg-primary-50 text-primary-700 font-bold px-6 py-3 rounded-full border border-primary-100 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
                                    {brand.productCount} {t('brands.products') || 'Aktif İlan'}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Products Grid */}
                <div>
                    <div className="flex items-end justify-between mb-8 px-2">
                        <h2 className="text-3xl font-bold text-heading tracking-tight">
                            Tüm İlanlar
                        </h2>
                        <span className="text-subtle font-medium text-sm">
                            {products.length} sonuç gösteriliyor
                        </span>
                    </div>

                    {productsQuery.isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <div key={n} className="bg-surface-elevated rounded-3xl h-[400px] animate-pulse" />
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-surface-elevated rounded-[2.5rem] border border-border-subtle p-24 text-center shadow-sm"
                        >
                            <div className="inline-flex items-center justify-center w-24 h-24 bg-surface rounded-full mb-6">
                                <ArchiveBoxIcon className="w-10 h-10 text-border-strong" />
                            </div>
                            <h3 className="text-2xl font-bold text-heading mb-3">{t('brands.noProducts') || 'İlan Bulunamadı'}</h3>
                            <p className="text-muted max-w-md mx-auto mb-8">
                                Bu üreticiye ait henüz bir ilan eklenmemiş.
                            </p>
                            <Link href="/listings/new" className="inline-block px-10 py-4 bg-heading text-inverted rounded-full font-bold shadow-xl shadow-heading/10 hover:bg-primary-600 hover:shadow-primary-500/30 transition-all transform hover:-translate-y-1">
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
                                                className="group block bg-surface-elevated rounded-[1.5rem] p-3 h-full border border-border-subtle hover:border-primary-100/50 hover:shadow-2xl hover:shadow-border/50 transition-all duration-500 relative overflow-hidden"
                                            >
                                                {/* Image Area */}
                                                <div className="aspect-[4/3] relative bg-surface rounded-[1.2rem] overflow-hidden mb-4">
                                                    <OptimizedImage
                                                        src={getImageUrl(product.images?.[0])}
                                                        alt={product.title}
                                                        fill
                                                        className="object-cover group-hover:scale-110 transition-transform duration-700"
                                                        fallbackSrc="https://placehold.co/400x400?text=Ürün"
                                                    />

                                                    {/* Status Badges */}
                                                    <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
                                                        {product.isPreorder && (
                                                            <span className="bg-surface-elevated/90 backdrop-blur text-warning-600 text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm border border-warning-100">ÖN SİPARİŞ</span>
                                                        )}
                                                        {product.isLimited && (
                                                            <span className="bg-heading/90 backdrop-blur text-inverted text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm">LIMITED</span>
                                                        )}
                                                        {product.status === 'sold' && (
                                                            <span className="bg-danger-500 text-inverted text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm">SATILDI</span>
                                                        )}
                                                    </div>

                                                    {isSale && product.discountPercent && (
                                                        <div className="absolute top-3 right-3 bg-danger-500 text-inverted text-xs font-black px-2 py-1 rounded-md shadow-sm z-10">
                                                            %{product.discountPercent}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="px-2 pb-2">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                            {product.condition ? (conditionLabels[product.condition] || product.condition) : 'Bilinmiyor'}
                                                        </span>
                                                        {product.seller?.displayName && (
                                                            <span className="text-[10px] font-medium text-subtle truncate max-w-[80px] flex items-center gap-1">
                                                                <UserAvatar displayName={product.seller.displayName} avatarUrl={product.seller.avatarUrl} size="xs" />
                                                                @{product.seller.displayName}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <h3 className="font-bold text-heading text-sm mb-3 line-clamp-2 leading-snug group-hover:text-primary-600 transition-colors h-10">
                                                        {product.title}
                                                    </h3>

                                                    <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                                                        <div className="flex flex-col">
                                                            {isSale ? (
                                                                <>
                                                                    <span className="text-xs text-subtle line-through decoration-danger-400">₺{originalPrice.toLocaleString('tr-TR')}</span>
                                                                    <span className="text-lg font-black text-heading">₺{effectivePrice.toLocaleString('tr-TR')}</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-lg font-black text-heading">₺{effectivePrice.toLocaleString('tr-TR')}</span>
                                                            )}
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-subtle group-hover:bg-primary-500 group-hover:text-inverted transition-all duration-300">
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
                    background-color: var(--surface-alt);
                    color: var(--primary-dark);
                }
            `}</style>
        </div>
    );
}
