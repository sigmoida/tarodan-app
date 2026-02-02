'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

// Modeller kategorileri - TARODAN tarzı detaylı
const MODELS_MENU = {
    tr: {
        title: 'MODELLER',
        columns: [
            {
                title: 'Arabalar',
                items: [
                    { label: 'Arabalar', slug: 'arabalar' },
                    { label: '4x4 Arazi Araçları', slug: 'arazi-araclari' },
                    { label: 'Özel & Modifiye Araçlar', slug: 'modifiye-araclar' },
                ],
            },
            {
                title: 'Motor Sporları',
                items: [
                    { label: 'F1/Formula One', slug: 'formula-1' },
                    { label: 'Sportscars/Le Mans/GT3', slug: 'sportscars' },
                    { label: 'Touring Cars', slug: 'touring-cars' },
                    { label: 'Rally/WRC', slug: 'rally' },
                    { label: 'Yarış Bisikletleri', slug: 'yaris-bisikletleri' },
                    { label: 'Kasklar', slug: 'kasklar' },
                ],
            },
            {
                title: 'Motosikletler',
                items: [
                    { label: 'Motosikletler', slug: 'motosikletler' },
                    { label: 'Off-road', slug: 'offroad' },
                    { label: 'Scooters/Mopeds', slug: 'scooters' },
                    { label: 'Trikes', slug: 'trikes' },
                    { label: 'Quad Bikes/ATV', slug: 'atv' },
                    { label: 'Kar Araçları', slug: 'kar-araclari' },
                ],
            },
            {
                title: 'Ticari Araçlar',
                items: [
                    { label: 'Kamyonlar', slug: 'kamyonlar' },
                    { label: 'Vans', slug: 'vans' },
                    { label: 'Pick up', slug: 'pickup' },
                    { label: 'Rescue & Recovery', slug: 'rescue' },
                    { label: 'Car Transporters', slug: 'car-transporters' },
                    { label: 'Trailers', slug: 'trailers' },
                    { label: 'Buses & Coaches', slug: 'buses' },
                    { label: 'İş Makineleri', slug: 'is-makineleri' },
                ],
            },
        ],
        bottomLinks: [
            { label: 'Trenler', slug: 'trenler' },
            { label: 'Tarım Araçları', slug: 'tarim-araclari' },
            { label: 'Gemiler', slug: 'gemiler' },
            { label: 'Uçaklar', slug: 'ucaklar' },
            { label: 'Acil Durum Araçları', slug: 'acil-durum-araclari' },
            { label: 'Askeri Araçlar', slug: 'askeri-araclar' },
        ],
    },
    en: {
        title: 'MODELS',
        columns: [
            {
                title: 'Cars',
                items: [
                    { label: 'Cars', slug: 'arabalar' },
                    { label: '4x4 Off-Road Vehicles', slug: 'arazi-araclari' },
                    { label: 'Custom & Modified', slug: 'modifiye-araclar' },
                ],
            },
            {
                title: 'Motorsports',
                items: [
                    { label: 'F1/Formula One', slug: 'formula-1' },
                    { label: 'Sportscars/Le Mans/GT3', slug: 'sportscars' },
                    { label: 'Touring Cars', slug: 'touring-cars' },
                    { label: 'Rally/WRC', slug: 'rally' },
                    { label: 'Racing Bikes', slug: 'yaris-bisikletleri' },
                    { label: 'Helmets', slug: 'kasklar' },
                ],
            },
            {
                title: 'Motorcycles',
                items: [
                    { label: 'Motorcycles', slug: 'motosikletler' },
                    { label: 'Off-road', slug: 'offroad' },
                    { label: 'Scooters/Mopeds', slug: 'scooters' },
                    { label: 'Trikes', slug: 'trikes' },
                    { label: 'Quad Bikes/ATV', slug: 'atv' },
                    { label: 'Snow Vehicles', slug: 'kar-araclari' },
                ],
            },
            {
                title: 'Commercial Vehicles',
                items: [
                    { label: 'Trucks', slug: 'kamyonlar' },
                    { label: 'Vans', slug: 'vans' },
                    { label: 'Pick up', slug: 'pickup' },
                    { label: 'Rescue & Recovery', slug: 'rescue' },
                    { label: 'Car Transporters', slug: 'car-transporters' },
                    { label: 'Trailers', slug: 'trailers' },
                    { label: 'Buses & Coaches', slug: 'buses' },
                    { label: 'Construction', slug: 'is-makineleri' },
                ],
            },
        ],
        bottomLinks: [
            { label: 'Trains', slug: 'trenler' },
            { label: 'Agriculture', slug: 'tarim-araclari' },
            { label: 'Ships', slug: 'gemiler' },
            { label: 'Aircrafts', slug: 'ucaklar' },
            { label: 'Emergency Vehicles', slug: 'acil-durum-araclari' },
            { label: 'Military', slug: 'askeri-araclar' },
        ],
    },
};

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

// Markalar listesi - Araç markaları
const BRANDS_MENU = {
    tr: {
        title: 'MARKALAR',
        items: [
            'Alfa Romeo', 'Aston Martin', 'Audi', 'Bentley', 'BMW', 'Bugatti', 'Chevrolet',
            'Dodge', 'Ferrari', 'Fiat', 'Ford', 'Honda', 'Jaguar', 'Lamborghini',
            'Land Rover', 'Lotus', 'Maserati', 'Mazda', 'McLaren', 'Mercedes-Benz',
            'Mini', 'Mitsubishi', 'Nissan', 'Opel', 'Pagani', 'Peugeot', 'Porsche',
            'Renault', 'Rolls-Royce', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
        ],
    },
    en: {
        title: 'BRANDS',
        items: [
            'Alfa Romeo', 'Aston Martin', 'Audi', 'Bentley', 'BMW', 'Bugatti', 'Chevrolet',
            'Dodge', 'Ferrari', 'Fiat', 'Ford', 'Honda', 'Jaguar', 'Lamborghini',
            'Land Rover', 'Lotus', 'Maserati', 'Mazda', 'McLaren', 'Mercedes-Benz',
            'Mini', 'Mitsubishi', 'Nissan', 'Opel', 'Pagani', 'Peugeot', 'Porsche',
            'Renault', 'Rolls-Royce', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
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

// Ana kategori bar linkleri
const CATEGORY_BAR_ITEMS = {
    tr: [
        { label: 'Yeni Gelenler', href: '/listings?sortBy=createdAt&sortOrder=desc' },
        { label: 'Çok Satanlar', href: '/listings?sortBy=viewCount&sortOrder=desc' },
        { label: 'İndirimler', href: '/listings?discountOnly=true' },
        { label: 'Modeller', dropdown: 'models' },
        { label: 'Markalar', dropdown: 'brands' },
        { label: 'Üreticiler', dropdown: 'manufacturers' },
        { label: 'Ölçek', dropdown: 'scales' },
    ],
    en: [
        { label: 'New Arrivals', href: '/listings?sortBy=createdAt&sortOrder=desc' },
        { label: 'Best Sellers', href: '/listings?sortBy=viewCount&sortOrder=desc' },
        { label: 'On Sale', href: '/listings?discountOnly=true' },
        { label: 'Models', dropdown: 'models' },
        { label: 'Brands', dropdown: 'brands' },
        { label: 'Manufacturers', dropdown: 'manufacturers' },
        { label: 'Scale', dropdown: 'scales' },
    ],
};

type DropdownType = 'models' | 'brands' | 'manufacturers' | 'scales' | null;

export default function CategoryNavBar() {
    const { locale } = useTranslation();
    const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
    const navRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const categoryItems = CATEGORY_BAR_ITEMS[locale as 'tr' | 'en'];
    const modelsMenu = MODELS_MENU[locale as 'tr' | 'en'];
    const manufacturersMenu = MANUFACTURERS_MENU[locale as 'tr' | 'en'];
    const brandsMenu = BRANDS_MENU[locale as 'tr' | 'en'];
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
        <nav ref={navRef} className="bg-gray-100 border-b border-gray-200 relative z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center h-11 gap-1 overflow-x-auto scrollbar-hide">
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
                                    className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <button
                                    className={`whitespace-nowrap px-3 py-2 text-sm font-medium flex items-center gap-1 rounded-md transition-colors ${activeDropdown === item.dropdown
                                        ? 'text-orange-600 bg-orange-50'
                                        : 'text-gray-700 hover:text-orange-600 hover:bg-orange-50'
                                        }`}
                                >
                                    {item.label}
                                    <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${activeDropdown === item.dropdown ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Dropdowns */}
            <AnimatePresence>
                {/* Models Dropdown */}
                {activeDropdown === 'models' && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 bg-white shadow-xl border-b border-gray-200 z-50"
                        onMouseEnter={() => handleMouseEnter('models')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            <h3 className="text-orange-500 font-bold text-sm mb-4 uppercase tracking-wide">
                                {modelsMenu.title}
                            </h3>
                            <div className="grid grid-cols-4 gap-8">
                                {modelsMenu.columns.map((column) => (
                                    <div key={column.title}>
                                        <h4 className="font-semibold text-gray-900 mb-3">{column.title}</h4>
                                        <ul className="space-y-2">
                                            {column.items.map((item) => (
                                                <li key={item.slug}>
                                                    <Link
                                                        href={`/listings?category=${item.slug}`}
                                                        className="text-sm text-gray-600 hover:text-orange-600 hover:underline"
                                                    >
                                                        {item.label}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
                                {modelsMenu.bottomLinks.map((link) => (
                                    <Link
                                        key={link.slug}
                                        href={`/listings?category=${link.slug}`}
                                        className="text-sm text-gray-600 hover:text-orange-600 hover:underline"
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Manufacturers Dropdown */}
                {activeDropdown === 'manufacturers' && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 bg-white shadow-xl border-b border-gray-200 z-50"
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

                {/* Brands Dropdown */}
                {activeDropdown === 'brands' && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 bg-white shadow-xl border-b border-gray-200 z-50"
                        onMouseEnter={() => handleMouseEnter('brands')}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            <h3 className="text-orange-500 font-bold text-sm mb-4 uppercase tracking-wide">
                                {brandsMenu.title}
                            </h3>
                            <div className="grid grid-cols-5 gap-3">
                                {brandsMenu.items.map((brand) => (
                                    <Link
                                        key={brand}
                                        href={`/listings?brand=${encodeURIComponent(brand)}`}
                                        className="text-sm text-gray-600 hover:text-orange-600 hover:underline py-1"
                                    >
                                        {brand}
                                    </Link>
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
                        className="absolute left-0 right-0 bg-white shadow-xl border-b border-gray-200 z-50"
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
