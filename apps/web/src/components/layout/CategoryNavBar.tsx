'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { categoriesApi, manufacturersApi, listingsApi } from '@/lib/api';

interface Category {
    id: string;
    name: string;
    slug: string;
}

interface Manufacturer {
    id: string;
    name: string;
    slug: string;
}

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

// Helper function to group manufacturers alphabetically
function groupManufacturers(manufacturers: Manufacturer[]): Array<{ range: string; items: Array<{ name: string; id: string }> }> {
    const groups: Array<{ range: string; items: Array<{ name: string; id: string }> }> = [
        { range: 'A-E', items: [] },
        { range: 'E-M', items: [] },
        { range: 'N-S', items: [] },
        { range: 'T-Z', items: [] },
    ];

    manufacturers.forEach((mfr) => {
        const firstLetter = mfr.name.charAt(0).toUpperCase();
        if (firstLetter >= 'A' && firstLetter <= 'E') {
            groups[0].items.push({ name: mfr.name, id: mfr.id });
        } else if (firstLetter >= 'E' && firstLetter <= 'M') {
            groups[1].items.push({ name: mfr.name, id: mfr.id });
        } else if (firstLetter >= 'N' && firstLetter <= 'S') {
            groups[2].items.push({ name: mfr.name, id: mfr.id });
        } else if (firstLetter >= 'T' && firstLetter <= 'Z') {
            groups[3].items.push({ name: mfr.name, id: mfr.id });
        }
    });

    // Sort items within each group and filter out empty groups
    return groups
        .map((group) => ({
            range: group.range,
            items: group.items.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((group) => group.items.length > 0);
}

type DropdownType = 'scales' | 'categories' | null;

export default function CategoryNavBar() {
    const { locale } = useTranslation();
    const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
    const navRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch data from APIs
    const [categories, setCategories] = useState<Category[]>([]);
    const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
    const [scaleItems, setScaleItems] = useState<string[]>([]);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const response = await categoriesApi.findAll();
                const cats = Array.isArray(response.data) ? response.data : response.data.data || [];
                setCategories(cats);
            } catch (error) {
                console.error('Failed to fetch categories:', error);
            }
        };

        const fetchManufacturers = async () => {
            try {
                const response = await manufacturersApi.findAll();
                const raw = response.data;
                const items = Array.isArray(raw) ? raw : (raw?.data ?? []);
                setManufacturers(Array.isArray(items) ? items : []);
            } catch (error) {
                console.error('Failed to fetch manufacturers:', error);
            }
        };

        const fetchFilters = async () => {
            try {
                const response = await listingsApi.getFilters();
                const data = response.data as { scales?: string[] };
                if (data.scales?.length) setScaleItems(data.scales);
            } catch {
                // Keep empty, will use fallback
            }
        };

        fetchCategories();
        fetchManufacturers();
        fetchFilters();
    }, []);

    const categoryItems = CATEGORY_BAR_ITEMS[locale as 'tr' | 'en'];
    const scalesMenu = {
        title: locale === 'en' ? 'SCALE' : 'ÖLÇEK',
        items: scaleItems.length > 0 ? scaleItems : ['1:18', '1:24', '1:43', '1:64', '1:87'],
    };

    // Group manufacturers alphabetically
    const manufacturerGroups = groupManufacturers(manufacturers);
    const manufacturersMenu = {
        title: locale === 'en' ? 'MANUFACTURERS' : 'ÜRETİCİLER',
        groups: manufacturerGroups,
    };

    // Map categories to vehicle types (categories are vehicle types in this system)
    const vehicleTypes = categories.map((cat) => ({
        label: cat.name,
        slug: cat.slug,
    }));

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

    // Scroll yapılınca dropdown kapat; aksi halde fixed panel nav'dan ayrı kalıp beyaz alan kalıyor
    useEffect(() => {
        const handleScroll = () => {
            if (activeDropdown) {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setActiveDropdown(null);
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [activeDropdown]);

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
                                    {vehicleTypes.map((type) => (
                                        <Link
                                            key={type.slug}
                                            href={`/listings?category=${encodeURIComponent(type.slug)}`}
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
                                                    <span key={item.id} className="inline-flex">
                                                        <Link
                                                            href={`/listings?manufacturer=${encodeURIComponent(item.name)}&manufacturerId=${encodeURIComponent(item.id)}`}
                                                            className="text-xs text-gray-600 hover:text-orange-600 transition-colors"
                                                        >
                                                            {item.name}
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
