'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

// Üreticiler listesi - Alfabetik gruplandırılmış
const MANUFACTURERS_MENU = {
    tr: {
        title: 'ÜRETİCİLER',
        groups: [
            {
                range: 'A-E',
                items: ['Abrex', 'Airfix', 'American Diorama', 'Atlantic', 'Atlas Editions', 'Bburago', 'Brekina', 'Britains', 'Cada', 'Cararama', 'Corgi', 'CMJ - Jian Feng Juan Toys', 'CMC', 'Cobi', 'Cult', 'DeAgostini', 'Diecast Masters', 'Ebbro'],
            },
            {
                range: 'E-M',
                items: ['GreenLight Collectibles', 'GT Spirit', 'i0lcek', 'IXO', 'Kess', 'KK Olcek', 'LCD', 'Looksmart', 'Maisto', 'Matrix', 'MINI GT', 'Minichamps', 'Mitica', 'Model Car Group', 'Motormax'],
            },
            {
                range: 'N-S',
                items: ['NewRay', 'Norev', 'OttOmobile', 'Oxford', 'Diecast', 'Paragon', 'Pop Race', 'Olcekxtric', 'Schuco', 'Siku', 'Solido', 'Spark', 'Sun Star'],
            },
            {
                range: 'T-Z',
                items: ['Tarmac Works', 'TopSpeed', 'Touring', 'Modelcars', 'Triple 9 Collection', 'Trumpeter', 'Unbranded', 'Welly', 'Werk83', 'WhiteBox'],
            },
        ],
    },
    en: {
        title: 'MANUFACTURERS',
        groups: [
            {
                range: 'A-E',
                items: ['Abrex', 'Airfix', 'American Diorama', 'Atlantic', 'Atlas Editions', 'Bburago', 'Brekina', 'Britains', 'Cada', 'Cararama', 'Corgi', 'CMJ - Jian Feng Juan Toys', 'CMC', 'Cobi', 'Cult', 'DeAgostini', 'Diecast Masters', 'Ebbro'],
            },
            {
                range: 'E-M',
                items: ['GreenLight Collectibles', 'GT Spirit', 'i0lcek', 'IXO', 'Kess', 'KK Olcek', 'LCD', 'Looksmart', 'Maisto', 'Matrix', 'MINI GT', 'Minichamps', 'Mitica', 'Model Car Group', 'Motormax'],
            },
            {
                range: 'N-S',
                items: ['NewRay', 'Norev', 'OttOmobile', 'Oxford', 'Diecast', 'Paragon', 'Pop Race', 'Olcekxtric', 'Schuco', 'Siku', 'Solido', 'Spark', 'Sun Star'],
            },
            {
                range: 'T-Z',
                items: ['Tarmac Works', 'TopSpeed', 'Touring', 'Modelcars', 'Triple 9 Collection', 'Trumpeter', 'Unbranded', 'Welly', 'Werk83', 'WhiteBox'],
            },
        ],
    },
};

// Ölçek listesi
const SCALES_MENU = {
    tr: {
        title: 'ÖLÇEK',
        items: ['1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36', '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200'],
    },
    en: {
        title: 'SCALE',
        items: ['1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36', '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200'],
    },
};

// Bar: Yeni Gelenler, Çok Satanlar, İndirimler, Ön Sipariş, Markalar, Üreticiler, Ölçek
const CATEGORY_BAR_ITEMS = {
    tr: [
        { label: 'Kategoriler', dropdown: 'categories' },
        { label: 'Yeni Gelenler', href: '/listings?sortBy=created_desc' },
        { label: 'Çok Satanlar', href: '/listings?sortBy=view_count_desc' },
        { label: 'İndirimler', href: '/listings?discountOnly=true' },
        { label: 'Koleksiyonlar', href: '/collections' },
        { label: 'Üreticiler', href: '/ureticiler' },
        { label: 'Ölçek', dropdown: 'scales' },
    ],
    en: [
        { label: 'Categories', dropdown: 'categories' },
        { label: 'New Arrivals', href: '/listings?sortBy=created_desc' },
        { label: 'Best Sellers', href: '/listings?sortBy=view_count_desc' },
        { label: 'On Sale', href: '/listings?discountOnly=true' },
        { label: 'Collections', href: '/collections' },
        { label: 'Manufacturers', href: '/ureticiler' },
        { label: 'Scale', dropdown: 'scales' },
    ],
};

const CATEGORIES_MENU = {
    tr: {
        title: 'KATEGORİLER',
        vehicleTypes: [
            { label: 'Arabalar', slug: 'araba' },
            { label: 'Motosikletler', slug: 'motosiklet' },
            { label: 'Motorsports / Yarış', slug: 'motorsports' },
            { label: 'Ticari Araçlar', slug: 'ticari' },
            { label: 'İnşaat Araçları', slug: 'insaat' },
            { label: 'Tarım Araçları', slug: 'tarim' },
            { label: 'Askeri Araçlar', slug: 'askeri' },
            { label: 'Acil Durum Araçları', slug: 'acil-durum' },
            { label: 'Gemiler', slug: 'gemi' },
            { label: 'Trenler', slug: 'tren' },
            { label: 'Uçaklar', slug: 'ucak' },
            { label: 'Setler', slug: 'set' },
        ],
    },
    en: {
        title: 'CATEGORIES',
        vehicleTypes: [
            { label: 'Cars', slug: 'araba' },
            { label: 'Motorcycles', slug: 'motosiklet' },
            { label: 'Motorsports / Racing', slug: 'motorsports' },
            { label: 'Commercial Vehicles', slug: 'ticari' },
            { label: 'Construction', slug: 'insaat' },
            { label: 'Agriculture', slug: 'tarim' },
            { label: 'Military', slug: 'askeri' },
            { label: 'Emergency Vehicles', slug: 'acil-durum' },
            { label: 'Ships', slug: 'gemi' },
            { label: 'Trains', slug: 'tren' },
            { label: 'Aircrafts', slug: 'ucak' },
            { label: 'Sets', slug: 'set' },
        ],
    },
};

type DropdownType = 'scales' | 'categories' | null;

export default function CategoryNavBar() {
    const { locale } = useTranslation();
    const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
    const navRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const categoryItems = CATEGORY_BAR_ITEMS[locale as 'tr' | 'en'];
    const manufacturersMenu = MANUFACTURERS_MENU[locale as 'tr' | 'en'];
    const scalesMenu = SCALES_MENU[locale as 'tr' | 'en'];
    const categoriesMenu = CATEGORIES_MENU[locale as 'tr' | 'en'];

    const handleMouseEnter = (dropdown: DropdownType) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setActiveDropdown(dropdown);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setActiveDropdown(null);
        }, 150);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const dropdownPortal = typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
            {activeDropdown === 'scales' && (
                <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="fixed left-0 right-0 bg-white shadow-xl border-b border-gray-200"
                    style={{ top: navRef.current ? navRef.current.getBoundingClientRect().bottom + 'px' : 'auto', zIndex: 9999 }}
                    onMouseEnter={() => handleMouseEnter('scales')}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
                        <h3 className="text-orange-500 font-bold text-sm mb-4 uppercase tracking-wide">
                            {scalesMenu.title}
                        </h3>
                        <div className="flex flex-wrap gap-2.5">
                            {scalesMenu.items.map((scale) => (
                                <Link
                                    key={scale}
                                    href={`/listings?scale=${encodeURIComponent(scale)}`}
                                    className="px-4 py-2 bg-gray-50 border border-gray-200 hover:bg-orange-50 hover:border-orange-300 text-gray-700 hover:text-orange-600 text-sm font-medium transition-colors"
                                    style={{ borderRadius: '4px' }}
                                >
                                    {scale}
                                </Link>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {activeDropdown === 'categories' && (
                <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="fixed left-0 right-0 bg-white shadow-xl border-b border-gray-200"
                    style={{ top: navRef.current ? navRef.current.getBoundingClientRect().bottom + 'px' : 'auto', zIndex: 9999 }}
                    onMouseEnter={() => handleMouseEnter('categories')}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-orange-500 font-bold text-sm mb-4 uppercase tracking-wide">
                                    {locale === 'en' ? 'VEHICLE TYPES' : 'ARAÇ TÜRLERİ'}
                                </h3>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                                    {categoriesMenu.vehicleTypes.map((type) => (
                                        <Link
                                            key={type.slug}
                                            href={`/listings?vehicleType=${encodeURIComponent(type.slug)}`}
                                            className="text-sm text-gray-600 hover:text-orange-600 transition-colors py-1"
                                        >
                                            {type.label}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-orange-500 font-bold text-sm mb-3 uppercase tracking-wide">
                                    {manufacturersMenu.title}
                                </h3>
                                <div className="space-y-2.5">
                                    {manufacturersMenu.groups.map((group) => (
                                        <div key={group.range}>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{group.range}</p>
                                            <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                                                {group.items.map((item, idx) => (
                                                    <span key={item} className="inline-flex">
                                                        <Link
                                                            href={`/listings?manufacturer=${encodeURIComponent(item)}`}
                                                            className="text-xs text-gray-600 hover:text-orange-600 transition-colors"
                                                        >
                                                            {item}
                                                        </Link>
                                                        {idx < group.items.length - 1 && <span className="text-gray-300 mx-1">·</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <Link
                                        href="/listings"
                                        className="text-xs text-orange-500 font-semibold hover:text-orange-600 transition-colors inline-block mt-1"
                                    >
                                        {locale === 'en' ? 'All Manufacturers →' : 'Tüm Üreticiler →'}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    ) : null;

    return (
        <>
            <nav ref={navRef} className="bg-orange-500 border-b border-orange-600 relative z-40">
                <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16">
                    <div className="flex items-center h-11 gap-0.5 overflow-x-auto scrollbar-hide">
                        {categoryItems.map((item) => (
                            <div
                                key={item.label}
                                className="relative"
                                onMouseEnter={() => item.dropdown ? handleMouseEnter(item.dropdown as DropdownType) : null}
                                onMouseLeave={handleMouseLeave}
                            >
                                {item.href ? (
                                    <Link
                                        href={item.href}
                                        className="whitespace-nowrap px-3 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors rounded"
                                    >
                                        {item.label}
                                    </Link>
                                ) : (
                                    <button
                                        className={`whitespace-nowrap px-3 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors rounded flex items-center gap-1 ${activeDropdown === item.dropdown ? 'text-white bg-white/10' : ''}`}
                                    >
                                        {item.label}
                                        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === item.dropdown ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </nav>
            {dropdownPortal}
        </>
    );
}
