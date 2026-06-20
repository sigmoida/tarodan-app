"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import {
  Button,
  Checkbox,
  Input,
  Select,
  Textarea,
} from "@tarodan/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import { type ColumnDef } from "@/components/DataTable";
import { ResourceListPage } from "@/components/ResourceListPage";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { useAdminResource } from "@/hooks/useAdminResource";

// Koleksiyonlar ↔ AI Denetim sekmeleri (ortak AdminTabs yapısı)
const COLLECTION_TABS = [
  { key: "list", label: "Koleksiyonlar" },
  { key: "ai", label: "AI Denetim" },
];

// ─── Tipler ────────────────────────────────────────────────────────────────

interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  isFeatured: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  owner: { id: string; displayName: string; avatarUrl?: string; membershipTier?: string | null };
  createdAt: string;
  updatedAt: string;
}

interface CollectionFormData {
  name: string;
  description: string;
  isPublic: boolean;
  isFeatured: boolean;
  coverImageUrl: string;
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const searchParams = useSearchParams();
  // Tab URL'den türetilir
  const tab = searchParams.get("tab") === "ai" ? "ai" : "list";
  // Modal / form state — mutasyon mantığı için zorunlu, veri çekme için değil
  const [showModal, setShowModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState<CollectionFormData>({
    name: "",
    description: "",
    isPublic: true,
    isFeatured: false,
    coverImageUrl: "",
  });

  // ── Veri çekme (useAdminResource) ──────────────────────────────────────────
  const {
    rows,
    total,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    isLoading,
    refetch,
    setTabUrl,
  } = useAdminResource<Collection>({
    queryKey: "collections",
    fetcher: (params) =>
      adminApi.getCollections({
        page: params.page,
        limit: params.limit,
        search: params.search,
        isPublic:
          params.isPublic !== undefined ? params.isPublic === "true" : undefined,
        isFeatured:
          params.isFeatured !== undefined ? params.isFeatured === "true" : undefined,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      }),
    limit: 20,
    syncUrl: true,
    initialFilters: { isPublic: "all", isFeatured: "all", sortBy: "", sortOrder: "" },
    errorMessage: "Koleksiyonlar yüklenemedi",
  });

  const handleTabChange = (key: string) => {
    setTabUrl(key, { defaultTab: "list" });
  };

  // ── Modal yardımcıları ─────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingCollection(null);
    setFormData({
      name: "",
      description: "",
      isPublic: true,
      isFeatured: false,
      coverImageUrl: "",
    });
    setShowModal(true);
  };

  const openEditModal = (collection: Collection) => {
    setEditingCollection(collection);
    setFormData({
      name: collection.name,
      description: collection.description || "",
      isPublic: collection.isPublic,
      isFeatured: collection.isFeatured,
      coverImageUrl: collection.coverImageUrl || "",
    });
    setShowModal(true);
  };

  // ── Mutasyonlar ────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCollection) {
        await adminApi.updateCollection(editingCollection.id, formData);
        toast.success("Koleksiyon güncellendi");
      } else {
        await adminApi.createCollection(formData);
        toast.success("Koleksiyon oluşturuldu");
      }
      setShowModal(false);
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteCollection(id);
      toast.success("Koleksiyon silindi");
      setDeleteConfirm(null);
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Silme işlemi başarısız");
    }
  };

  const toggleVisibility = async (collection: Collection) => {
    try {
      await adminApi.setCollectionVisibility(collection.id, !collection.isPublic);
      toast.success(
        collection.isPublic ? "Koleksiyon gizlendi" : "Koleksiyon görünür yapıldı"
      );
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  // ── Kolon tanımları ────────────────────────────────────────────────────────

  const columns: ColumnDef<Collection, any>[] = [
    {
      header: "Koleksiyon",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.coverImageUrl ? (
            <img
              src={row.original.coverImageUrl}
              alt=""
              className="w-10 h-10 rounded object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-surface-alt flex items-center justify-center text-muted text-xs">
              N/A
            </div>
          )}
          <div>
            <div className="font-medium text-heading">{row.original.name}</div>
            {row.original.description && (
              <div className="text-sm text-muted truncate max-w-xs">
                {row.original.description}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Sahibi",
      cell: ({ row }) => {
        const tier = row.original.owner?.membershipTier;
        return (
          <div className="flex items-center gap-2">
            <span className="text-muted">{row.original.owner?.displayName || "-"}</span>
            {(tier === "premium" || tier === "business") && (
              <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                tier === "business" ? "bg-info-50 text-info-700" : "bg-warning-50 text-warning-700"
              }`}>
                {tier === "business" ? "İş" : "Premium"}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "itemCount",
      header: () => <span className="block text-center">Ürün</span>,
      cell: ({ row }) => (
        <div className="text-center text-muted">{row.original.itemCount}</div>
      ),
    },
    {
      id: "viewCount",
      header: () => <span className="block text-center">Görüntüleme</span>,
      cell: ({ row }) => (
        <div className="text-center text-muted">{row.original.viewCount}</div>
      ),
    },
    {
      id: "likeCount",
      header: () => <span className="block text-center">Beğeni</span>,
      cell: ({ row }) => (
        <div className="text-center text-muted">{row.original.likeCount}</div>
      ),
    },
    {
      id: "status",
      header: () => <span className="block text-center">Durum</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-2">
          {row.original.isPublic ? (
            <span className="px-2 py-1 text-xs bg-success-50 text-success-700 rounded">
              Görünür
            </span>
          ) : (
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">Gizli</span>
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton
            icon={row.original.isPublic ? EyeSlashIcon : EyeIcon}
            onClick={() => toggleVisibility(row.original)}
            title={row.original.isPublic ? "Gizle" : "Görünür yap"}
          />
          <ActionIconButton
            icon={PencilIcon}
            onClick={() => openEditModal(row.original)}
            title="Düzenle"
          />
          <ActionIconButton
            icon={TrashIcon}
            onClick={() => setDeleteConfirm(row.original.id)}
            title="Sil"
            variant="danger"
          />
        </ActionButtons>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  // AI Denetim sekmesi → ortak ModerationEventsPanel (koleksiyon olayları: kapak/öğe)
  if (tab === "ai") {
    return (
      <ModerationEventsPanel
        entityType="collection"
        title="Koleksiyonlar"
        tabs={COLLECTION_TABS}
        activeTab={tab}
        onTabChange={handleTabChange}
      />
    );
  }

  return (
    <>
      <ResourceListPage<Collection>
        title="Koleksiyonlar"
        description={`Toplam ${total} koleksiyon`}
        tabs={COLLECTION_TABS}
        activeTab={tab}
        onTabChange={handleTabChange}
        headerActions={
          <Button variant="primary" size="md" onClick={openCreateModal}>
            <PlusIcon className="w-5 h-5" />
            Yeni Koleksiyon
          </Button>
        }
        search={{ placeholder: "Koleksiyon ara..." }}
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={onSearchSubmit}
        filters={
          <>
            <Select
              value={filters.isPublic ?? "all"}
              onChange={(e) => setFilter("isPublic", e.target.value)}
              className="sm:w-40"
            >
              <option value="all">Tüm Görünürlük</option>
              <option value="true">Görünür</option>
              <option value="false">Gizli</option>
            </Select>
            <Select
              value={filters.isFeatured ?? "all"}
              onChange={(e) => setFilter("isFeatured", e.target.value)}
              className="sm:w-40"
            >
              <option value="all">Tümü</option>
              <option value="true">Öne Çıkan</option>
            </Select>
          </>
        }
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText="Henüz koleksiyon yok"
        getRowId={(c) => c.id}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
            <h2 className="text-xl font-semibold text-heading mb-4 leading-tight">
              {editingCollection ? "Koleksiyon Düzenle" : "Yeni Koleksiyon"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Koleksiyon Adı *
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Açıklama
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Kapak Görseli URL
                </label>
                <Input
                  type="url"
                  value={formData.coverImageUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, coverImageUrl: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
              <div className="flex items-center gap-4">
                <Checkbox
                  checked={formData.isPublic}
                  onChange={(e) =>
                    setFormData({ ...formData, isPublic: e.target.checked })
                  }
                  label="Görünür"
                />
                <Checkbox
                  checked={formData.isFeatured}
                  onChange={(e) =>
                    setFormData({ ...formData, isFeatured: e.target.checked })
                  }
                  label="Öne Çıkan"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="secondary"
                  size="md"
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1"
                >
                  İptal
                </Button>
                <Button variant="primary" size="md" type="submit" className="flex-1">
                  {editingCollection ? "Güncelle" : "Oluştur"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
            <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">
              Koleksiyonu Sil
            </h3>
            <p className="text-muted mb-6">
              Bu koleksiyonu silmek istediğinizden emin misiniz? Bu işlem geri
              alınamaz.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1"
              >
                İptal
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1"
              >
                Sil
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
