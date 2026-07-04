'use client';

import { useState, useEffect } from 'react';
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
import { manufacturersApi } from '@/lib/api';import { Button } from '@tarodan/ui';


const FALLBACK_MANUFACTURERS = [
  'Hot Wheels', 'Matchbox', 'Majorette', 'Tomica', 'Bburago', 'Maisto',
  'AUTOart', 'Minichamps', 'Kyosho', 'CMC', 'GT Spirit', 'Almost Real',
];

const CATEGORY_MENU = {
  tr: {
    newArrivals: { label: 'Yeni Gelenler', icon: SparklesIcon, href: '/listings?sortBy=created_desc' },
    brands: {
      label: 'Üreticiler',
      icon: FireIcon,
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
    },
  },
  en: {
    newArrivals: { label: 'New Arrivals', icon: SparklesIcon, href: '/listings?sortBy=created_desc' },
    brands: {
      label: 'Brands',
      icon: FireIcon,
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
    },
  },
};

type MenuSection = 'scales' | 'manufacturers' | null;

export default function CategoryMegaMenu() {
  const { locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>(null);
  const [manufacturerNames, setManufacturerNames] = useState<string[]>(FALLBACK_MANUFACTURERS);

  useEffect(() => {
    manufacturersApi.findAll().then(res => {
      const raw = res.data;
      const data = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const names = (Array.isArray(data) ? data : []).map((m: any) => m.name);
      if (names.length > 0) setManufacturerNames(names);
    }).catch(() => {});
  }, []);

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
      <div className="bg-heading border-b border-border-strong">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-12">
            {/* Main Menu Trigger */}
            <Button variant="secondary" className="flex items-center gap-2 px-4 py-2 text-inverted font-medium hover:bg-heading rounded-lg transition-colors"
              onClick={() => setIsOpen(!isOpen)}>
              <Squares2X2Icon className="w-5 h-5" />
              <span>{locale === 'en' ? 'Browse' : 'İlanlara Göz At'}</span>
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </Button>

            {/* Quick Links */}
            <div className="hidden md:flex items-center gap-1 ml-4">
              <Link
                href={menu.newArrivals.href}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-border-strong hover:text-inverted hover:bg-heading rounded-lg transition-colors"
              >
                <SparklesIcon className="w-4 h-4 text-warning-400" />
                {menu.newArrivals.label}
              </Link>
              <Link
                href="/listings?sortBy=view_count_desc"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-border-strong hover:text-inverted hover:bg-heading rounded-lg transition-colors"
              >
                <FireIcon className="w-4 h-4 text-primary-400" />
                {locale === 'en' ? 'Popular' : 'Popüler'}
              </Link>
              <Link
                href="/collections"
                className="px-3 py-2 text-sm text-border-strong hover:text-inverted hover:bg-heading rounded-lg transition-colors"
              >
                {locale === 'en' ? 'Collections' : 'Koleksiyonlar'}
              </Link>
              <Link
                href="/trades"
                className="px-3 py-2 text-sm text-border-strong hover:text-inverted hover:bg-heading rounded-lg transition-colors"
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
            className="absolute left-0 right-0 bg-surface-elevated shadow-2xl border-b border-border z-50"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex">
                {/* Left Sidebar - Menu Sections */}
                <div className="w-56 bg-surface border-r border-border py-4">
                  <Link
                    href="/manufacturers"
                    className="flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium text-body hover:bg-surface-alt hover:text-primary-600 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <TruckIcon className="w-5 h-5 text-muted" />
                      {menu.brands.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </Link>

                  <Button variant="secondary" onMouseEnter={() => setActiveSection('scales')}
                    className={`flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium transition-colors ${activeSection === 'scales' ? 'bg-primary-50 text-primary-600' : 'text-body hover:bg-surface-alt'
                      }`}>
                    <span className="flex items-center gap-2">
                      <span className="text-lg">📏</span>
                      {menu.scales.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>

                  <Button variant="secondary" onMouseEnter={() => setActiveSection('manufacturers')}
                    className={`flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium transition-colors ${activeSection === 'manufacturers' ? 'bg-primary-50 text-primary-600' : 'text-body hover:bg-surface-alt'
                      }`}>
                    <span className="flex items-center gap-2">
                      <TruckIcon className="w-5 h-5" />
                      {menu.manufacturers.label}
                    </span>
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>

                  {/* View All Link */}
                  <div className="mt-4 px-4">
                    <Link
                      href="/listings"
                      className="block w-full py-2.5 text-center text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                    >
                      {locale === 'en' ? 'View All Listings' : 'Tüm İlanları Gör'} →
                    </Link>
                  </div>
                </div>

                {/* Right Content - Dynamic based on active section */}
                <div className="flex-1 p-6 min-h-[320px]">
                  {activeSection === 'scales' && (
                    <div>
                      <h3 className="text-lg font-bold text-heading mb-4">{menu.scales.label}</h3>
                      <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                        {menu.scales.items.map((scale) => (
                          <Link
                            key={scale}
                            href={`/listings?scale=${encodeURIComponent(scale)}`}
                            className="px-4 py-3 text-center text-sm font-bold text-body bg-surface-alt hover:bg-primary-100 hover:text-primary-600 rounded-lg transition-colors"
                          >
                            {scale}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeSection === 'manufacturers' && (
                    <div>
                      <h3 className="text-lg font-bold text-heading mb-4">{menu.manufacturers.label}</h3>
                      <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                        {manufacturerNames.map((manufacturer) => (
                          <Link
                            key={manufacturer}
                            href={`/listings?manufacturer=${encodeURIComponent(manufacturer)}`}
                            className="px-4 py-2.5 text-sm font-medium text-body hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          >
                            {manufacturer}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {!activeSection && (
                    <div className="flex items-center justify-center h-full text-subtle">
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
