'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Brand {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    description?: string;
    country?: string;
    foundedYear?: number;
    productCount: number;
}

const countryFlags: Record<string, string> = {
    'Germany': '🇩🇪', 'Italy': '🇮🇹', 'France': '🇫🇷', 'Japan': '🇯🇵',
    'USA': '🇺🇸', 'China': '🇨🇳', 'Hong Kong': '🇭🇰', 'Thailand': '🇹🇭', 'UK': '🇬🇧',
};

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            type: 'spring',
            stiffness: 100,
            damping: 15
        }
    }
};

export default function BrandsPage() {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'count'>('name');

    const { data: brands = [], isLoading } = useQuery<Brand[]>({
        queryKey: ['brands'],
        queryFn: async () => {
            const res = await api.get('/brands');
            return res.data;
        },
    });

    const filteredBrands = useMemo(() => {
        let result = brands.filter(
            (brand) =>
                brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (brand.description && brand.description.toLowerCase().includes(searchQuery.toLowerCase()))
        );

        if (sortBy === 'count') {
            result.sort((a, b) => (b.productCount || 0) - (a.productCount || 0));
        } else {
            result.sort((a, b) => a.name.localeCompare(b.name));
        }

        return result;
    }, [brands, searchQuery, sortBy]);

    const groupedBrands = useMemo(() => {
        const groups: Record<string, Brand[]> = {};
        filteredBrands.forEach((brand) => {
            const letter = brand.name[0].toUpperCase();
            if (!groups[letter]) groups[letter] = [];
            groups[letter].push(brand);
        });
        return groups;
    }, [filteredBrands]);

    const alphabet = Object.keys(groupedBrands).sort();

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-24 pt-12">
            <div className="container mx-auto px-4 max-w-7xl">
                {/* Hero Section */}
                <div className="text-center mb-16 relative">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-orange-200/20 to-orange-100/20 blur-3xl rounded-full -z-10"
                    />

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="text-6xl md:text-7xl font-black text-gray-900 mb-6 tracking-tighter"
                    >
                        Markalar
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                        className="text-xl text-gray-500 max-w-2xl mx-auto font-medium leading-relaxed"
                    >
                        {t('brands.subtitle') || 'Dünyanın en prestijli diecast üreticilerini keşfedin. Koleksiyonunuz için en iyisini seçin.'}
                    </motion.p>
                </div>

                {/* Floating Search Bar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="sticky top-6 z-40 mb-16 max-w-4xl mx-auto"
                >
                    <div className="glass-panel p-2 rounded-full shadow-xl shadow-gray-200/50 border border-white/60 backdrop-blur-xl bg-white/80 flex items-center gap-2">
                        <div className="relative flex-1">
                            <MagnifyingGlassIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('brands.searchPlaceholder') || 'Marka ara...'}
                                className="w-full bg-transparent border-none outline-none pl-16 pr-6 py-4 text-lg text-gray-900 placeholder-gray-400 rounded-full"
                            />
                        </div>
                        <div className="h-8 w-[1px] bg-gray-200 mx-2" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="bg-transparent border-none outline-none text-gray-600 font-semibold px-6 py-4 cursor-pointer hover:text-orange-600 transition-colors rounded-full"
                        >
                            <option value="name">A-Z Sırala</option>
                            <option value="count">Popülerlik</option>
                        </select>
                    </div>
                </motion.div>

                {/* Alphabet Quick Nav */}
                {!isLoading && alphabet.length > 1 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-wrap justify-center gap-2 mb-12"
                    >
                        {alphabet.map((letter) => (
                            <button
                                key={letter}
                                onClick={() => {
                                    const el = document.getElementById(`letter-${letter}`);
                                    if (el) {
                                        const y = el.getBoundingClientRect().top + window.scrollY - 140; // Offset for sticky header
                                        window.scrollTo({ top: y, behavior: 'smooth' });
                                    }
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold text-gray-400 hover:bg-orange-500 hover:text-white transition-all duration-300"
                            >
                                {letter}
                            </button>
                        ))}
                    </motion.div>
                )}

                {/* Grid Content */}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 opacity-50">
                        <div className="w-16 h-16 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin mb-6" />
                        <p className="text-gray-400 font-medium tracking-widest uppercase text-sm">{t('common.loading')}</p>
                    </div>
                ) : filteredBrands.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-32"
                    >
                        <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-50 rounded-full mb-6">
                            <span className="text-4xl">🔍</span>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Sonuç Bulunamadı</h3>
                        <p className="text-gray-500 mb-8">"{searchQuery}" aramasıyla eşleşen marka yok.</p>
                        <button
                            onClick={() => setSearchQuery('')}
                            className="px-8 py-3 bg-gray-900 text-white rounded-full font-bold hover:bg-orange-600 transition-colors shadow-lg hover:shadow-orange-500/25"
                        >
                            Filtreleri Temizle
                        </button>
                    </motion.div>
                ) : (
                    <div className="space-y-20">
                        {alphabet.map((letter) => (
                            <motion.div
                                key={letter}
                                id={`letter-${letter}`}
                                variants={containerVariants}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: "-50px" }}
                                className="scroll-mt-32"
                            >
                                <div className="flex items-end gap-6 mb-10 border-b border-gray-100 pb-4">
                                    <h2 className="text-8xl font-black text-gray-100 leading-[0.8] select-none">
                                        {letter}
                                    </h2>
                                    <span className="text-lg font-bold text-orange-600 bg-orange-50 px-4 py-1 rounded-full mb-2">
                                        {groupedBrands[letter].length} Marka
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                    {groupedBrands[letter].map((brand) => (
                                        <Link key={brand.id} href={`/brands/${brand.slug}`} className="block h-full">
                                            <motion.div
                                                variants={itemVariants}
                                                whileHover={{ y: -8, scale: 1.02 }}
                                                className="group bg-white rounded-[2rem] p-6 h-full border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-gray-200/50 transition-all duration-500 relative overflow-hidden"
                                            >
                                                {/* Hover Background Gradient */}
                                                <div className="absolute inset-0 bg-gradient-to-br from-orange-50/0 to-orange-50/0 group-hover:from-orange-50/30 group-hover:to-orange-100/30 transition-all duration-500" />

                                                {/* Logo Area */}
                                                <div className="relative aspect-[4/3] mb-6 bg-gray-50 rounded-3xl flex items-center justify-center p-6 transition-colors group-hover:bg-white border border-transparent group-hover:border-orange-100/50">
                                                    {brand.logo ? (
                                                        <img
                                                            src={brand.logo}
                                                            alt={brand.name}
                                                            className="w-full h-full object-contain filter grayscale group-hover:grayscale-0 transition-all duration-500 opacity-80 group-hover:opacity-100"
                                                        />
                                                    ) : (
                                                        <span className="text-4xl font-black text-gray-200 group-hover:text-orange-500 transition-colors">
                                                            {brand.name[0]}
                                                        </span>
                                                    )}

                                                    {/* Badge */}
                                                    {brand.productCount > 0 && (
                                                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm border border-gray-100">
                                                            <span className="text-xs font-bold text-gray-900">
                                                                {brand.productCount}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="relative">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1">
                                                            {brand.name}
                                                        </h3>
                                                        {brand.country && countryFlags[brand.country] && (
                                                            <span className="text-lg opacity-50 group-hover:opacity-100 transition-opacity" title={brand.country}>
                                                                {countryFlags[brand.country]}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 text-sm text-gray-400 group-hover:text-gray-500 transition-colors">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-orange-400 transition-colors" />
                                                        {brand.productCount > 0 ? (
                                                            <span>{brand.productCount} model listeleniyor</span>
                                                        ) : (
                                                            <span>Henüz model yok</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </Link>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            <style jsx global>{`
                .glass-panel {
                    background: rgba(255, 255, 255, 0.7);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                }
            `}</style>
        </div>
    );
}
