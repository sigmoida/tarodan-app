'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  TruckIcon,
  FireIcon,
  SparklesIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { categoriesApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

// Kategori yapısı
const CATEGORY_MENU = {
  tr: {
    newArrivals: { label: 'Yeni Gelenler', icon: SparklesIcon, href: '/listings?sortBy=created_desc' },
    categories: {
      label: 'Kategoriler',
      icon: Squares2X2Icon,
      items: [
        { label: 'Arabalar', slug: 'arabalar', icon: '🚗' },
        { label: 'Motosikletler', slug: 'motosikletler', icon: '🏍️' },
        { label: 'Motorsports', slug: 'motorsports', icon: '🏎️' },
        { label: 'Acil Durum Araçları', slug: 'acil-durum-araclari', icon: '🚑' },
        { label: 'Ticari Araçlar', slug: 'ticari-araclar', icon: '🚚' },
        { label: 'İnşaat Araçları', slug: 'insaat-araclari', icon: '🚜' },
        { label: 'Tarım Araçları', slug: 'tarim-araclari', icon: '🚜' },
        { label: 'Askeri Araçlar', slug: 'askeri-araclar', icon: '🪖' },
        { label: 'Gemiler', slug: 'gemiler', icon: '🚢' },
        { label: 'Trenler', slug: 'trenler', icon: '🚂' },
        { label: 'Uçaklar', slug: 'ucaklar', icon: '✈️' },
        { label: 'Setler', slug: 'setler', icon: '📦' },
      ],
    },
    brands: {
      label: 'Markalar',
      icon: FireIcon,
      items: [
        'Audi', 'Alfa Romeo', 'BMW', 'Ferrari', 'Ford', 'Lamborghini',
        'Mercedes-Benz', 'Porsche', 'Toyota', 'Volkswagen', 'Chevrolet', 'Dodge',
      ],
    },
    scales: {
      label: 'Ölçek',
      items: [
        '1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36',
        '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200',
      ],
    },
    manufacturers: {
      label: 'Üretici',
      icon: TruckIcon,
      items: [
        'Hot Wheels', 'Matchbox', 'Majorette', 'Tomica', 'Bburago', 'Maisto',
        'AUTOart', 'Minichamps', 'Kyosho', 'CMC', 'GT Spirit', 'Almost Real',
      ],
    },
  },
  en: {
    newArrivals: { label: 'New Arrivals', icon: SparklesIcon, href: '/listings?sortBy=created_desc' },
    categories: {
      label: 'Categories',
      icon: Squares2X2Icon,
      items: [
        { label: 'Cars', slug: 'arabalar', icon: '🚗' },
        { label: 'Motorcycles', slug: 'motosikletler', icon: '🏍️' },
        { label: 'Motorsports', slug: 'motorsports', icon: '🏎️' },
        { label: 'Emergency Vehicles', slug: 'acil-durum-araclari', icon: '🚑' },
        { label: 'Commercial Vehicles', slug: 'ticari-araclar', icon: '🚚' },
        { label: 'Construction', slug: 'insaat-araclari', icon: '🚜' },
        { label: 'Agriculture', slug: 'tarim-araclari', icon: '🚜' },
        { label: 'Military', slug: 'askeri-araclar', icon: '🪖' },
        { label: 'Ships', slug: 'gemiler', icon: '🚢' },
        { label: 'Trains', slug: 'trenler', icon: '🚂' },
        { label: 'Aircrafts', slug: 'ucaklar', icon: '✈️' },
        { label: 'Sets', slug: 'setler', icon: '📦' },
      ],
    },
    brands: {
      label: 'Brands',
      icon: FireIcon,
      items: [
        'Audi', 'Alfa Romeo', 'BMW', 'Ferrari', 'Ford', 'Lamborghini',
        'Mercedes-Benz', 'Porsche', 'Toyota', 'Volkswagen', 'Chevrolet', 'Dodge',
      ],
    },
    scales: {
      label: 'Scale',
      items: [
        '1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36',
        '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200',
      ],
    },
    manufacturers: {
      label: 'Manufacturer',
      icon: TruckIcon,
      items: [
        'Hot Wheels', 'Matchbox', 'Majorette', 'Tomica', 'Bburago', 'Maisto',
        'AUTOart', 'Minichamps', 'Kyosho', 'CMC', 'GT Spirit', 'Almost Real',
      ],
    },
  },
};

type MenuSection = 'categories' | 'brands' | 'scales' | 'manufacturers' | null;

export default function CategoryMegaMenu() {
  const { locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>(null);

  const menu = CATEGORY_MENU[locale as 'tr' | 'en'];

  // Fetch dynamic categories
  const { data: dbCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const res = await categoriesApi.findAll();
        // Handle both standard JSON reponse and direct array
        return Array.isArray(res.data) ? res.data : (res.data.data || []);
      } catch (err) {
        console.error('Failed to load menu categories', err);
        return [];
      }
    },
    staleTime: 1000 * 60 * 10, // 10 minutes cache
  });

  // Use DB categories if available, otherwise fallback to static list
  const displayCategories = dbCategories && dbCategories.length > 0
    ? dbCategories.map((c: any) => ({
      label: c.name,
      slug: c.slug,
      icon: '📦' // Default icon since DB doesn't have icon field yet
    }))
    : menu.categories.items;

  // Icons map for hardcoded matches (optional enhancement)
  const ICON_MAP: Record<string, string> = {
    'arabalar': '🚗',
    'cars': '🚗',
    'motosikletler': '🏍️',
    'motorcycles': '🏍️',
    'ucaklar': '✈️',
    'aircrafts': '✈️',
    'gemiler': '🚢',
    'ships': '🚢'
  };

  // Enhance dynamic categories with icons if matching slug
  const finalCategories = displayCategories.map((item: any) => ({
    ...item,
    icon: ICON_MAP[item.slug] || item.icon || '📦'
  }));

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => {
        setIsOpen(false);
        setActiveSection(null);
      }}
    >
      {/* Kategori Bar - Navbar altında */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-12">
            {/* Main Menu Trigger */}
            <button
              className="flex items-center gap-2 px-4 py-2 text-white font-medium hover:bg-gray-800 rounded-lg transition-colors"
              onClick={() => setIsOpen(!isOpen)}
            >
              <Squares2X2Icon className="w-5 h-5" />
              <span>{locale === 'en' ? 'All Categories' : 'Tüm Kategoriler'}</span>
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Quick Links */}
            <div className="hidden md:flex items-center gap-1 ml-4">
              <Link
                href={menu.newArrivals.href}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <SparklesIcon className="w-4 h-4 text-yellow-400" />
                {menu.newArrivals.label}
              </Link>
              <Link
                href="/listings?sortBy=viewCount"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <FireIcon className="w-4 h-4 text-orange-400" />
                {locale === 'en' ? 'Popular' : 'Popüler'}
              </Link>
              <Link
                href="/collections"
                className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                {locale === 'en' ? 'Collections' : 'Koleksiyonlar'}
              </Link>
              <Link
                href="/trades"
                className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                {locale === 'en' ? 'Trades' : 'Takaslar'}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Mega Menu Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 bg-white shadow-2xl border-b border-gray-200 z-50"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex">
                {/* Left Sidebar - Menu Sections */}
                <div className="w-56 bg-gray-50 border-r border-gray-200 py-4">
                  <button
                    onMouseEnter={() => setActiveSection('categories')}
                    className={`flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium transition-colors ${activeSection === 'categories' ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <Squares2X2Icon className="w-5 h-5" />
                      {menu.categories.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>

                  <button
                    onMouseEnter={() => setActiveSection('brands')}
                    className={`flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium transition-colors ${activeSection === 'brands' ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg">🏎️</span>
                      {menu.brands.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>

                  <button
                    onMouseEnter={() => setActiveSection('scales')}
                    className={`flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium transition-colors ${activeSection === 'scales' ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg">📏</span>
                      {menu.scales.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>

                  <button
                    onMouseEnter={() => setActiveSection('manufacturers')}
                    className={`flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium transition-colors ${activeSection === 'manufacturers' ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <TruckIcon className="w-5 h-5" />
                      {menu.manufacturers.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>

                  {/* View All Link */}
                  <div className="mt-4 px-4">
                    <Link
                      href="/listings"
                      className="block w-full py-2.5 text-center text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                    >
                      {locale === 'en' ? 'View All Listings' : 'Tüm İlanları Gör'} →
                    </Link>
                  </div>
                </div>

                {/* Right Content - Dynamic based on active section */}
                <div className="flex-1 p-6 min-h-[320px]">
                  {activeSection === 'categories' && (
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-4">{menu.categories.label}</h3>
                      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
                        {finalCategories.map((item: any) => (
                          <Link
                            key={item.slug}
                            href={`/listings?category=${item.slug}`}
                            className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-orange-50 rounded-xl transition-colors group"
                          >
                            <span className="text-2xl group-hover:scale-110 transition-transform">{item.icon}</span>
                            <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600">{item.label}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeSection === 'brands' && (
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-4">{menu.brands.label}</h3>
                      <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                        {menu.brands.items.map((brand) => (
                          <Link
                            key={brand}
                            href={`/listings?brand=${encodeURIComponent(brand)}`}
                            className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          >
                            {brand}
                          </Link>
                        ))}
                      </div>
                      <Link
                        href="/listings"
                        className="inline-block mt-4 text-sm text-orange-600 hover:text-orange-700 font-medium"
                      >
                        {locale === 'en' ? 'View All Brands' : 'Tüm Markaları Gör'} →
                      </Link>
                    </div>
                  )}

                  {activeSection === 'scales' && (
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-4">{menu.scales.label}</h3>
                      <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                        {menu.scales.items.map((scale) => (
                          <Link
                            key={scale}
                            href={`/listings?scale=${encodeURIComponent(scale)}`}
                            className="px-4 py-3 text-center text-sm font-bold text-gray-700 bg-gray-100 hover:bg-orange-100 hover:text-orange-600 rounded-lg transition-colors"
                          >
                            {scale}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeSection === 'manufacturers' && (
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-4">{menu.manufacturers.label}</h3>
                      <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                        {menu.manufacturers.items.map((manufacturer) => (
                          <Link
                            key={manufacturer}
                            href={`/listings?manufacturer=${encodeURIComponent(manufacturer)}`}
                            className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          >
                            {manufacturer}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {!activeSection && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <p>{locale === 'en' ? 'Hover over a category to explore' : 'Keşfetmek için bir kategori üzerine gelin'}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
