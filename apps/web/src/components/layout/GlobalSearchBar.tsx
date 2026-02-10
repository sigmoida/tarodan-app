'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon, ClockIcon, XCircleIcon, FireIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { useRecentSearchesStore } from '@/stores/recentSearchesStore';

const POPULAR_SEARCHES = {
  tr: ['Hot Wheels', 'Matchbox', 'Minichamps', '1:18 ölçek', 'Ferrari', 'Porsche'],
  en: ['Hot Wheels', 'Matchbox', 'Minichamps', '1:18 scale', 'Ferrari', 'Porsche'],
};

export default function GlobalSearchBar() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { searches: recentSearches, addSearch, removeSearch, clearSearches } = useRecentSearchesStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      addSearch(trimmed);
      setShowDropdown(false);
      setSearchQuery('');
      router.push(`/listings?search=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleSuggestionClick = (query: string) => {
    addSearch(query);
    setShowDropdown(false);
    setSearchQuery('');
    router.push(`/listings?search=${encodeURIComponent(query)}`);
  };

  return (
    <div ref={containerRef} className="bg-white border-b border-gray-200 py-3">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative">
          <form onSubmit={handleSubmit} className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder={t('nav.searchPlaceholder')}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all placeholder:text-gray-500 text-gray-900"
              aria-label={t('nav.searchPlaceholder')}
            />
          </form>

          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50"
              >
                {recentSearches.length > 0 && (
                  <div className="p-3 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                        <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                        {locale === 'en' ? 'Recent Searches' : 'Son Aramalar'}
                      </span>
                      <button
                        type="button"
                        onClick={clearSearches}
                        className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                      >
                        {locale === 'en' ? 'Clear' : 'Temizle'}
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {recentSearches.map((q, i) => (
                        <div key={`${q}-${i}`} className="flex items-center justify-between gap-2 group">
                          <button
                            type="button"
                            onClick={() => handleSuggestionClick(q)}
                            className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors text-left"
                            title={q}
                          >
                            <ClockIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="truncate">{q}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeSearch(q); }}
                            className="p-1.5 shrink-0 text-gray-400 hover:text-red-500 rounded transition-opacity opacity-0 group-hover:opacity-100"
                            aria-label={locale === 'en' ? 'Remove' : 'Kaldır'}
                          >
                            <XCircleIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="p-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <FireIcon className="w-3.5 h-3.5 shrink-0" />
                    {locale === 'en' ? 'Popular' : 'Popüler'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_SEARCHES[locale as 'tr' | 'en'].map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className="px-3 py-2 text-sm bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-600 rounded-lg transition-colors whitespace-nowrap"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
