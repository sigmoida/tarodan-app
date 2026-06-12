'use client';

import { useState } from 'react';
import { collectionsApi } from '@/lib/api';
import { Button, Checkbox, Input, Select, Textarea } from '@tarodan/ui';

export default function CreateCollectionModal({
  onClose,
  onCreated,
  flatCategories,
}: {
  onClose: () => void;
  onCreated: (collectionId?: string) => void;
  flatCategories: { id: string; name: string; slug: string }[];
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await collectionsApi.create({
        name,
        description,
        isPublic,
        ...(categoryId ? { categoryId } : {}),
      });
      const createdId = data?.id;
      onCreated(createdId);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Create collection error:', error);
      const errorMessage = error.response?.data?.message || 'Koleksiyon oluşturulamadı';
      alert(errorMessage);
      if (errorMessage.includes('üyeliğiniz') || errorMessage.includes('yetkiniz yok')) {
        setTimeout(() => { window.location.href = '/pricing'; }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50">
      <div className="bg-surface-elevated rounded p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4 text-heading">Yeni Koleksiyon</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1 font-medium uppercase tracking-wide">İsim</label>
            <Input type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded text-sm text-heading placeholder-subtle focus:outline-none focus:border-primary-400"
              placeholder="Hot Wheels Koleksiyonum"
              required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1 font-medium uppercase tracking-wide">Açıklama</label>
            <Textarea value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded text-sm text-heading placeholder-subtle focus:outline-none focus:border-primary-400"
              placeholder="Koleksiyon hakkında..."
              rows={3} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1 font-medium uppercase tracking-wide">Kategori</label>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              selectSize="sm"
            >
              <option value="">Kategori seçin (isteğe bağlı)</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              label="Herkese açık koleksiyon"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
              İptal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="flex-1"
              disabled={loading || !name}
              isLoading={loading}
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
