'use client';

import { useState, useRef, useEffect } from 'react';
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
        { label: 'Yeni Gelenler', href: '/listings?sortBy=created_desc' },
        { label: 'Çok Satanlar', href: '/listings?sortBy=view_count_desc' },
        { label: 'İndirimler', href: '/listings?discountOnly=true' },
        { label: 'Ön Sipariş', href: '/listings?preOrder=true' },
        { label: 'Limited Edition', href: '/listings?limited=true' },
        { label: 'Setler', href: '/listings?set=true' },
        { label: 'Koleksiyonlar', href: '/collections' },
        { label: 'Markalar', href: '/brands' },
        { label: 'Üreticiler', dropdown: 'manufacturers' },
        { label: 'Ölçek', dropdown: 'scales' },
    ],
    en: [
        { label: 'New Arrivals', href: '/listings?sortBy=created_desc' },
        { label: 'Best Sellers', href: '/listings?sortBy=view_count_desc' },
        { label: 'On Sale', href: '/listings?discountOnly=true' },
        { label: 'Pre-Order', href: '/listings?preOrder=true' },
        { label: 'Limited Edition', href: '/listings?limited=true' },
        { label: 'Sets', href: '/listings?set=true' },
        { label: 'Collections', href: '/collections' },
        { label: 'Brands', href: '/brands' },
        { label: 'Manufacturers', dropdown: 'manufacturers' },
        { label: 'Scale', dropdown: 'scales' },
    ],
};

type DropdownType = 'manufacturers' | 'scales' | null;

export default function CategoryNavBar() {
    const { locale } = useTranslation();
    const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
    const navRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const categoryItems = CATEGORY_BAR_ITEMS[locale as 'tr' | 'en'];
    const manufacturersMenu = MANUFACTURERS_MENU[locale as 'tr' | 'en'];
    const scalesMenu = SCALES_MENU[locale as 'tr' | 'en'];

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

    return (
        <nav ref={navRef} className="bg-surface-alt border-b border-gray-200 relative z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center h-11 gap-0.5 overflow-x-auto scrollbar-hide">
                    {categoryItems.map((item, index) => (
                        <div
                            key={item.label}
                            className="relative"
                            onMouseEnter={() => item.dropdown ? handleMouseEnter(item.dropdown as DropdownType) : null}
                            onMouseLeave={handleMouseLeave}
                        >
                            {item.href ? (
                                <Link
                                    href={item.href}
                                    className="nav-link-animated"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <button
                                    className={`nav-link-animated flex items-center gap-1 ${activeDropdown === item.dropdown ? 'text-heading font-semibold' : ''}`}
                                >
                                    {item.label}
                                    <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === item.dropdown ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Dropdowns */}
            <AnimatePresence>
                {/* Manufacturers Dropdown */}
                {activeDropdown === 'manufacturers' && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 bg-white shadow-xl border-b border-gray-200 z-[100]"
                        onMouseEnter={() => handleMouseEnter('manufacturers')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            <h3 className="text-orange-500 font-bold text-sm mb-4 uppercase tracking-wide">
                                {manufacturersMenu.title}
                            </h3>
                            <div className="grid grid-cols-4 gap-8">
                                {manufacturersMenu.groups.map((group) => (
                                    <div key={group.range}>
                                        <h4 className="font-semibold text-gray-900 mb-3">{group.range}</h4>
                                        <ul className="space-y-1">
                                            {group.items.map((item) => (
                                                <li key={item}>
                                                    <Link
                                                        href={`/listings?manufacturer=${encodeURIComponent(item)}`}
                                                        className="text-sm text-gray-600 hover:text-orange-600 hover:underline"
                                                    >
                                                        {item}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Scales Dropdown */}
                {activeDropdown === 'scales' && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 bg-white shadow-xl border-b border-gray-200 z-[100]"
                        onMouseEnter={() => handleMouseEnter('scales')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            <h3 className="text-orange-500 font-bold text-sm mb-4 uppercase tracking-wide">
                                {scalesMenu.title}
                            </h3>
                            <div className="flex flex-wrap gap-3">
                                {scalesMenu.items.map((scale) => (
                                    <Link
                                        key={scale}
                                        href={`/listings?scale=${encodeURIComponent(scale)}`}
                                        className="px-4 py-2 bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-600 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        {scale}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
}
