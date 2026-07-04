'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { FolderPlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Button } from '@tarodan/ui';
import CreateCollectionModal from '@/components/CreateCollectionModal';
import { CollectionsProvider, useCollections } from './_context/CollectionsContext';
import CollectionsToolbar from './_components/CollectionsToolbar';
import CollectionsGrid from './_components/CollectionsGrid';

function CollectionsLayout() {
  const { t } = useTranslation();
  const {
    mounted,
    isAuthenticated,
    limits,
    flatCategories,
    showCreateModal,
    setShowCreateModal,
    showPremiumModal,
    setShowPremiumModal,
    handleCreateClick,
    handleCreated,
  } = useCollections();

  return (
    <div className="min-h-screen bg-surface">
      {/* Page Header */}
      <div className="bg-surface-elevated border-b border-border">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-heading flex items-center gap-2">
                <div className="w-1 h-6 bg-primary-500 rounded-sm" />
                {t('collection.collections')}
              </h1>
              <p className="text-sm text-muted mt-0.5">{t('footer.description')}</p>
            </div>
            <div className="flex items-center gap-2">
              {mounted && isAuthenticated && limits?.canCreateCollections && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleCreateClick}
                  className="flex items-center gap-1.5"
                >
                  <FolderPlusIcon className="w-4 h-4" />
                  {t('collection.createCollection')}
                </Button>
              )}
              {mounted && isAuthenticated && !limits?.canCreateCollections && (
                <Link
                  href="/pricing"
                  className="px-4 py-2 bg-surface-alt text-body hover:bg-border-subtle rounded text-sm font-medium transition-colors"
                >
                  {t('membership.upgrade')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
        <CollectionsToolbar />
        <CollectionsGrid />
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <CreateCollectionModal
          flatCategories={flatCategories}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Premium Required Modal */}
      {showPremiumModal && (
        <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-elevated rounded max-w-md w-full p-6 text-center"
          >
            <div className="w-14 h-14 bg-primary-50 rounded flex items-center justify-center mx-auto mb-4">
              <FolderPlusIcon className="w-7 h-7 text-primary-500" />
            </div>
            <h2 className="text-lg font-bold text-heading mb-2">Üyelik Yükseltme Gerekli</h2>
            <p className="text-muted text-sm mb-5">
              Koleksiyon oluşturma özelliği Temel ve üzeri üyelikler için aktiftir.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" size="md" className="flex-1" onClick={() => setShowPremiumModal(false)}>
                Vazgeç
              </Button>
              <Link href="/membership" className="flex-1 px-4 py-2.5 bg-primary-500 text-inverted rounded font-medium hover:bg-primary-600 transition-colors text-center text-sm">
                Üyeliği Yükselt
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default function CollectionsClient() {
  return (
    <CollectionsProvider>
      <CollectionsLayout />
    </CollectionsProvider>
  );
}
