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

// Göz atma menüsü: Markalar, Ölçek, Üretici (kategoriler = listings + sidebar filtreleri)
const CATEGORY_MENU = {
  tr: {
    newArrivals: { label: 'Yeni Gelenler', icon: SparklesIcon, href: '/listings?sortBy=created_desc' },
    brands: {
      label: 'Üreticiler',
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

type MenuSection = 'scales' | 'manufacturers' | null;

export default function CategoryMegaMenu() {
  const { locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>(null);

  const menu = CATEGORY_MENU[locale as 'tr' | 'en'];

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
              <span>{locale === 'en' ? 'Browse' : 'İlanlara Göz At'}</span>
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
                href="/listings?sortBy=view_count_desc"
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
                  <Link
                    href="/ureticiler"
                    className="flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-orange-600 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <TruckIcon className="w-5 h-5 text-gray-500" />
                      {menu.brands.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </Link>

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
                      <p>{locale === 'en' ? 'Hover over an option to explore' : 'Keşfetmek için bir seçeneğin üzerine gelin'}</p>
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
