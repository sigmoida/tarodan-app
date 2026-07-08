'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import { Button, Checkbox, Input, Select, Textarea } from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import { useTranslation } from '@/i18n/LanguageContext';

interface CollectionFormProps {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  categoryId: string;
  setCategoryId: (value: string) => void;
  flatCategories: { id: string; name: string; slug: string }[];
  coverImagePreview: string;
  onCoverImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingCover: boolean;
  isPublic: boolean;
  setIsPublic: (value: boolean) => void;
  isSaving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onDelete: () => void;
}

export default function CollectionForm({
  name,
  setName,
  description,
  setDescription,
  categoryId,
  setCategoryId,
  flatCategories,
  coverImagePreview,
  onCoverImageChange,
  isUploadingCover,
  isPublic,
  setIsPublic,
  isSaving,
  onSubmit,
  onCancel,
  onDelete,
}: CollectionFormProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-elevated rounded border border-border p-6 md:p-8">
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
            {t('collection.collectionNameLabel')}
          </label>
          <Input type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded text-sm text-heading placeholder-subtle bg-surface-elevated focus:outline-none focus:border-primary-400"
            placeholder={t('collection.namePlaceholder')}
            required
            minLength={3}
            maxLength={100} />
          <p className="mt-1 text-sm text-muted">
            {name.length}/100 {t('collection.characters')}
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
            {t('collection.descriptionLabel')}
          </label>
          <Textarea value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded text-sm text-heading placeholder-subtle bg-surface-elevated focus:outline-none focus:border-primary-400"
            placeholder={t('collection.descriptionPlaceholder')}
            rows={5}
            maxLength={500} />
          <p className="mt-1 text-sm text-muted">
            {description.length}/500 {t('collection.characters')}
          </p>
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
            {t('common.category')}
          </label>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t('common.none')}</option>
            {flatCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Cover Image Upload */}
        <div>
          <label className="block text-sm font-medium text-body mb-2">
            Kapak Resmi
          </label>
          <div className="space-y-3">
            {coverImagePreview && (
              <div className="relative w-full h-48 rounded overflow-hidden border border-border">
                <OptimizedImage
                  src={coverImagePreview}
                  alt="Cover preview"
                  fill
                  className="object-cover"
                  logContext={{ page: 'collection-edit-cover' }}
                />
              </div>
            )}
            <Input type="file"
              accept="image/*"
              onChange={onCoverImageChange}
              disabled={isUploadingCover}
              className="w-full px-3 py-2.5 border border-border rounded text-sm text-heading bg-surface-elevated focus:outline-none focus:border-primary-400 disabled:opacity-50 disabled:cursor-not-allowed" />
            {isUploadingCover && (
              <p className="text-sm text-muted">Yükleniyor...</p>
            )}
            <p className="text-sm text-muted">
              Kapak resmi yükleyin (maksimum 10MB). Kapak resmi yoksa otomatik olarak ilk 4 ürünün resimlerinden oluşturulacaktır.
            </p>
          </div>
        </div>

        {/* Public/Private */}
        <div className="flex items-center gap-3 p-3 bg-surface rounded border border-border-subtle">
          <Checkbox
            id="isPublic"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            label={t('collection.publicCollection')}
          />
        </div>
        <p className="text-sm text-muted -mt-4">
          {isPublic
            ? t('collection.publicCollectionDesc')
            : t('collection.privateCollectionDesc')}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-4 pt-4 border-t border-border">
          <div className="flex gap-4">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={onCancel}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="flex-1"
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? t('collection.saving') : t('collection.saveChanges')}
            </Button>
          </div>

          {/* Delete Button */}
          <Button
            type="button"
            variant="danger"
            size="md"
            className="flex items-center justify-center gap-2"
            onClick={onDelete}
          >
            <TrashIcon className="w-5 h-5" />
            {t('collection.deleteCollection')}
          </Button>
        </div>
      </form>
    </div>
  );
}
