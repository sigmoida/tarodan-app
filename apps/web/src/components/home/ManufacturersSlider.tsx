'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { manufacturersApi } from '@/lib/api';

interface ManufacturerItem {
    id: string;
    name: string;
    slug: string;
}

const MANUFACTURERS_FALLBACK: ManufacturerItem[] = [
    { id: '', name: 'Hot Wheels', slug: 'hot-wheels' },
    { id: '', name: 'Matchbox', slug: 'matchbox' },
    { id: '', name: 'Tamiya', slug: 'tamiya' },
    { id: '', name: 'AUTOart', slug: 'autoart' },
    { id: '', name: 'Kyosho', slug: 'kyosho' },
    { id: '', name: 'Maisto', slug: 'maisto' },
    { id: '', name: 'GreenLight', slug: 'greenlight' },
    { id: '', name: 'Bburago', slug: 'bburago' },
    { id: '', name: 'Minichamps', slug: 'minichamps' },
    { id: '', name: 'Tomica', slug: 'tomica' },
    { id: '', name: 'Majorette', slug: 'majorette' },
    { id: '', name: 'GT Spirit', slug: 'gt-spirit' },
    { id: '', name: 'CMC', slug: 'cmc' },
    { id: '', name: 'Almost Real', slug: 'almost-real' },
];

export default function ManufacturersSlider() {
    const { locale } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [manufacturers, setManufacturers] = useState<ManufacturerItem[]>(MANUFACTURERS_FALLBACK);

    useEffect(() => {
        const fetchManufacturers = async () => {
            try {
                const response = await manufacturersApi.findAll();
                const items = Array.isArray(response.data) ? response.data : response.data?.data || [];
                if (items.length > 0) setManufacturers(items);
            } catch {
                // keep fallback
            }
        };
        fetchManufacturers();
    }, []);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 0);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, []);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const scrollAmount = 300;
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
            setTimeout(checkScroll, 300);
        }
    };

    const buildHref = (m: ManufacturerItem) => {
        if (m.id) return `/listings?manufacturerId=${m.id}`;
        return `/listings?manufacturer=${encodeURIComponent(m.name)}`;
    };

    return (
        <section className="py-8 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-orange-500 rounded"></div>
                        <h2 className="text-xl md:text-2xl font-bold text-gray-900">
                            {locale === 'en' ? 'Diecast Manufacturers' : 'Diecast Üreticileri'}
                        </h2>
                    </div>
                    <Link
                        href="/listings"
                        className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1 text-sm"
                    >
                        {locale === 'en' ? 'View All' : 'Tümünü gör'}
                        <ArrowRightIcon className="w-4 h-4" />
                    </Link>
                </div>

                <div className="relative">
                    {canScrollLeft && (
                        <button
                            onClick={() => scroll('left')}
                            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center hover:bg-orange-50 transition-colors"
                            aria-label="Scroll left"
                        >
                            <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
                        </button>
                    )}

                    <div
                        ref={scrollRef}
                        onScroll={checkScroll}
                        className="flex gap-4 overflow-x-auto scrollbar-hide px-1 py-2"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {manufacturers.map((manufacturer, index) => (
                            <motion.div
                                key={manufacturer.slug}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                            >
                                <Link
                                    href={buildHref(manufacturer)}
                                    className="flex-shrink-0 w-28 h-20 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center hover:border-orange-400 hover:bg-orange-50 transition-all group"
                                >
                                    <span className="text-sm font-bold text-gray-700 group-hover:text-orange-600 text-center px-2">
                                        {manufacturer.name}
                                    </span>
                                </Link>
                            </motion.div>
                        ))}
                    </div>

                    {canScrollRight && (
                        <button
                            onClick={() => scroll('right')}
                            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center hover:bg-orange-50 transition-colors"
                            aria-label="Scroll right"
                        >
                            <ChevronRightIcon className="w-5 h-5 text-gray-600" />
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}
