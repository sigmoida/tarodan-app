'use client';

import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Button, Input, Select } from '@tarodan/ui';
import { useCollections } from '../_context/CollectionsContext';
import { type SortOption } from '../_lib/data';

export default function CollectionsToolbar() {
  const { t, locale } = useTranslation();
  const {
    mounted,
    isAuthenticated,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    categoryId,
    setCategoryFilter,
    flatCategories,
    myCollections,
  } = useCollections();

  return (
    <>
      {/* Tabs */}
      {mounted && isAuthenticated && (
        <div className="flex gap-1 mb-5 bg-surface-alt rounded-lg p-1 w-fit">
          <Button variant="secondary" onClick={() => { setActiveTab('public'); setSearchQuery(''); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'public' ? 'bg-surface-elevated text-heading shadow-sm' : 'text-muted hover:text-body'
            }`}>
            {t('collection.isPublic')}
          </Button>
          <Button variant="secondary" onClick={() => { setActiveTab('mine'); setSearchQuery(''); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'mine' ? 'bg-surface-elevated text-heading shadow-sm' : 'text-muted hover:text-body'
            }`}>
            {t('collection.myCollections')} ({myCollections.length})
          </Button>
        </div>
      )}

      {/* Search & Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
          <Input type="text"
            placeholder={t('collection.searchCollections')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 border border-border rounded-lg bg-surface-elevated text-heading placeholder-subtle focus:outline-none focus:border-primary-400" />
          {searchQuery && (
            <Button variant="secondary" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted">
              <XMarkIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'public' && (
            <Select
              value={categoryId}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-auto min-w-[140px]"
            >
              <option value="">{locale === 'en' ? 'All Categories' : 'Tüm Kategoriler'}</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
          )}
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="w-auto"
          >
            <option value="popular">{t('common.popular')}</option>
            <option value="recent">{t('common.newest')}</option>
            <option value="name">A-Z</option>
            <option value="items_desc">{t('common.desc')}</option>
            <option value="items_asc">{t('common.asc')}</option>
          </Select>
        </div>
      </div>
    </>
  );
}
