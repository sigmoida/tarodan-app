"use client";

import React, { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  ShieldCheckIcon,
  UserGroupIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  LockClosedIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Input, Select } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { PageHeader, ActionButtons, ActionIconButton } from "@/components/admin-list";
import { AdminTabs } from "@/components/AdminTabs";
import { adminApi } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import { useConfirm } from "@/components/ConfirmProvider";

// ─── Rol sabitleri ───────────────────────────────────────────────────────────

const ROLES = ["super_admin", "admin", "moderator"] as const;
type RoleId = (typeof ROLES)[number];

const ROLE_META: Record<RoleId, { label: string; color: string; description: string }> = {
  super_admin: {
    label: "Süper Admin",
    color: "bg-danger-500/10 text-danger-500 border-danger-200",
    description: "Platforma tam erişim. Sistem ayarları, finans ve tüm yönetim işlemleri.",
  },
  admin: {
    label: "Yönetici",
    color: "bg-primary-500/10 text-primary-500 border-primary-200",
    description: "Operasyonel yönetim. Sistem ayarları ve vergi hariç tüm işlemler.",
  },
  moderator: {
    label: "Moderatör",
    color: "bg-info-500/10 text-info-500 border-info-200",
    description: "İçerik moderasyonu. Yalnızca ürün, yorum, mesaj ve takas takibi.",
  },
};

// ─── Varsayılan izinler (backend DEFAULT_ROLE_PERMISSIONS ile senkron olmalı) ─

const FALLBACK_DEFAULTS: Record<RoleId, string[]> = {
  super_admin: [],
  admin: [
    "dashboard", "analytics",
    "orders", "trades", "shipping", "refund_requests", "refund_history",
    "products", "categories", "brands", "car_models", "manufacturers", "attributes", "collections",
    "users", "seller_applications", "seller_performance", "reviews",
    "payments", "commission", "payouts",
    "messages", "support", "discounts", "ads", "notifications", "email_templates", "pages",
    "ai_moderation",
  ],
  moderator: [
    "dashboard", "products", "users", "reviews", "messages", "support", "trades", "ai_moderation",
  ],
};

// ─── İzin grupları — sayfa başına tek izin, görüntüle/yönet ayrımı yok ───────

type PermDef = {
  key: string;
  label: string;
  description: string;
  pages: string[];
};

type PermGroup = {
  id: string;
  group: string;
  permissions: PermDef[];
};

const PERMISSION_GROUPS: PermGroup[] = [
  {
    id: "dashboard",
    group: "Dashboard & Analitik",
    permissions: [
      { key: "dashboard", label: "Dashboard", description: "Ana panel: günlük sipariş, gelir ve aktif kullanıcı sayaçları.", pages: ["/dashboard"] },
      { key: "analytics", label: "Analizler", description: "Satış grafiği, gelir analizi, kullanıcı büyümesi ve rapor sayfaları.", pages: ["/analytics"] },
    ],
  },
  {
    id: "operations",
    group: "Operasyon",
    permissions: [
      { key: "orders", label: "Siparişler", description: "Sipariş listesi, detay görüntüleme ve durum değiştirme.", pages: ["/orders", "/orders/:id"] },
      { key: "trades", label: "Takaslar", description: "Takas listesi, detay, onaylama, reddetme, kargo ve depo işlemleri.", pages: ["/trades", "/trades/:id"] },
      { key: "shipping", label: "Kargo", description: "Kargo etiketi oluşturma, takip ve depoya gönderim işlemleri.", pages: ["/shipping"] },
      { key: "refund_requests", label: "İade Talepleri", description: "İade talep listesi, detay görüntüleme, onaylama ve reddetme.", pages: ["/refund-requests", "/refund-requests/:id"] },
      { key: "refund_history", label: "İade Geçmişi", description: "Tamamlanmış iade kayıtları ve geçmiş liste.", pages: ["/refunds"] },
    ],
  },
  {
    id: "catalog",
    group: "Katalog",
    permissions: [
      { key: "products", label: "Ürünler", description: "Ürün listesi, detay, onaylama, reddetme ve düzenleme.", pages: ["/products", "/products/:id"] },
      { key: "categories", label: "Kategoriler", description: "Kategori ağacı oluşturma, düzenleme ve silme.", pages: ["/categories"] },
      { key: "brands", label: "Markalar", description: "Marka listesi, ekleme ve düzenleme.", pages: ["/brands"] },
      { key: "car_models", label: "Araç Modelleri", description: "Araç modeli ve yıl listesi yönetimi.", pages: ["/car-models"] },
      { key: "manufacturers", label: "Üreticiler", description: "Üretici/tedarikçi ekleme ve düzenleme.", pages: ["/manufacturers"] },
      { key: "attributes", label: "Ürün Özellikleri", description: "Özellik grubu ve değer yönetimi.", pages: ["/attributes"] },
      { key: "collections", label: "Koleksiyonlar", description: "Ürün koleksiyonu oluşturma ve düzenleme.", pages: ["/collections"] },
    ],
  },
  {
    id: "accounts",
    group: "Hesaplar",
    permissions: [
      { key: "users", label: "Kullanıcılar", description: "Kullanıcı listesi, profil, ban/ban kaldırma ve kimlik doğrulama.", pages: ["/users", "/users/:id"] },
      { key: "seller_applications", label: "Satıcı Başvuruları", description: "Satıcı başvurularını onaylama veya reddetme.", pages: ["/sellers/applications"] },
      { key: "seller_performance", label: "Satıcı Performansı", description: "Satıcı performans raporları ve istatistikleri.", pages: ["/sellers/performance"] },
      { key: "reviews", label: "Yorumlar", description: "Kullanıcı yorumlarını görüntüleme, onaylama ve reddetme.", pages: ["/reviews"] },
      { key: "staff", label: "Rol Yönetimi", description: "Yönetici hesabı oluşturma, rol atama ve izin matrisi düzenleme.", pages: ["/roles"] },
    ],
  },
  {
    id: "messaging",
    group: "Mesajlaşma",
    permissions: [
      { key: "messages", label: "Mesajlar", description: "Kullanıcılar arası mesaj konuşmalarını görüntüleme ve moderasyon.", pages: ["/messages", "/messages/:threadId"] },
      { key: "support", label: "Destek Talepleri", description: "Kullanıcı destek taleplerini görüntüleme ve yanıtlama.", pages: ["/support", "/support/:id"] },
    ],
  },
  {
    id: "marketing",
    group: "Pazarlama & İçerik",
    permissions: [
      { key: "discounts", label: "İndirimler", description: "İndirim kuponu oluşturma, düzenleme ve silme.", pages: ["/discounts"] },
      { key: "ads", label: "Reklamlar", description: "Banner ve reklam kampanyaları yönetimi.", pages: ["/ads"] },
      { key: "notifications", label: "Bildirimler", description: "Push bildirim oluşturma ve gönderme.", pages: ["/notifications"] },
      { key: "email_templates", label: "E-posta Şablonları", description: "E-posta şablonu oluşturma ve düzenleme.", pages: ["/email-templates"] },
      { key: "pages", label: "Sayfalar", description: "Statik içerik sayfaları yönetimi.", pages: ["/pages"] },
    ],
  },
  {
    id: "finance",
    group: "Finans",
    permissions: [
      { key: "payments", label: "Ödemeler", description: "Ödeme listesi, hold/release geçmişi ve istatistikler.", pages: ["/payments", "/payments/:id", "/payments/statistics"] },
      { key: "commission", label: "Komisyon", description: "Komisyon kuralları oluşturma, düzenleme ve silme.", pages: ["/commission"] },
      { key: "payouts", label: "Satıcı Ödemeleri", description: "Bekleyen ödeme transferleri ve payout geçmişi.", pages: ["/payouts"] },
      { key: "tax", label: "Vergi Ayarları", description: "KDV bölgeleri, vergi oranları ve kural yönetimi.", pages: ["/tax"] },
    ],
  },
  {
    id: "system",
    group: "Sistem",
    permissions: [
      { key: "ai_moderation", label: "AI Denetim", description: "AI moderasyon olayları, skorlar ve eşik ayarları.", pages: ["/ai-moderation"] },
      { key: "membership_tiers", label: "Üyelik Katmanları", description: "Üyelik katmanı oluşturma ve fiyatlandırma.", pages: ["/membership-tiers"] },
      { key: "settings", label: "Sistem Ayarları", description: "Platform genel ayarları ve konfigürasyon.", pages: ["/settings"] },
      { key: "logs", label: "Loglar", description: "Sistem hata logları, güvenlik olayları, e-posta logları ve denetim izi.", pages: ["/logs", "/audit-logs"] },
    ],
  },
];

// ─── Tipler ─────────────────────────────────────────────────────────────────

interface StaffItem {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

function formatDate(v: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

// ─── Bileşen ────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const confirm = useConfirm();
  const { user } = useSession();
  const isSuperAdmin = user?.role === "super_admin";

  const [activeTab, setActiveTab] = useState<"matrix" | "users">("matrix");

  // ── İzin matrisi durumu ──
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Grup açma/kapama
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // İzin açıklama paneli
  const [expandedPerm, setExpandedPerm] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    setMatrixLoading(true);
    try {
      const res = await adminApi.getRolePermissions();
      setPermissions(res.data ?? {});
    } catch {
      toast.error("İzin matrisi yüklenemedi");
      setPermissions(FALLBACK_DEFAULTS);
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  // ── Personel durumu ──
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({ super_admin: 0, admin: 0, moderator: 0 });
  const [staffLoading, setStaffLoading] = useState(true);
  const [allowAdminAssign, setAllowAdminAssign] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StaffItem | null>(null);
  const [form, setForm] = useState({ email: "", role: "moderator", password: "", displayName: "" });
  const [saving, setSaving] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  const fetchStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await adminApi.getStaff();
      setStaff(res.data?.items ?? []);
      setRoleCounts(res.data?.roleCounts ?? { super_admin: 0, admin: 0, moderator: 0 });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Admin personeli yüklenemedi");
    } finally {
      setStaffLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await adminApi.getStaffSettings();
      setAllowAdminAssign(!!res.data?.allowAdminAssign);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPermissions();
    fetchStaff();
    fetchSettings();
  }, [fetchPermissions, fetchStaff, fetchSettings]);

  // ── Matris yardımcıları ──

  const hasPermission = (role: string, perm: string) =>
    (permissions[role] ?? []).includes(perm);

  const togglePermission = (role: string, perm: string) => {
    if (!editMode || !isSuperAdmin || role === "super_admin") return;
    setPermissions((prev) => {
      const cur = prev[role] ?? [];
      const next = cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm];
      return { ...prev, [role]: next };
    });
    setMatrixDirty(true);
  };

  // Gruptaki tüm izinleri bir rol için toplu seç/kaldır
  const toggleGroup = (group: PermGroup, role: string, checked: boolean) => {
    if (!editMode || !isSuperAdmin || role === "super_admin") return;
    const groupKeys = group.permissions.map((p) => p.key);
    setPermissions((prev) => {
      const cur = prev[role] ?? [];
      const next = checked
        ? Array.from(new Set([...cur, ...groupKeys]))
        : cur.filter((k) => !groupKeys.includes(k));
      return { ...prev, [role]: next };
    });
    setMatrixDirty(true);
  };

  // Bir gruptaki tüm izinler o rol için seçili mi?
  const groupCheckedState = (group: PermGroup, role: string): "all" | "none" | "partial" => {
    const perms = permissions[role] ?? [];
    const count = group.permissions.filter((p) => perms.includes(p.key)).length;
    if (count === 0) return "none";
    if (count === group.permissions.length) return "all";
    return "partial";
  };

  const saveMatrix = async () => {
    setMatrixSaving(true);
    try {
      const res = await adminApi.setRolePermissions(permissions);
      setPermissions(res.data ?? permissions);
      setMatrixDirty(false);
      setEditMode(false);
      toast.success("İzin matrisi kaydedildi");
      // Sidebar filtrelemesini güncellemek için sayfayı yenile.
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Kaydetme başarısız");
    } finally {
      setMatrixSaving(false);
    }
  };

  const cancelEdit = async () => {
    if (matrixDirty) {
      if (
        !(await confirm({
          description: "Kaydedilmemiş değişiklikler var. Değişikliklerden vazgeçmek istediğinizden emin misiniz?",
          destructive: false,
        }))
      )
        return;
    }
    setEditMode(false);
    setMatrixDirty(false);
    fetchPermissions();
  };

  const resetToDefaults = async () => {
    if (
      !(await confirm({
        description:
          "Tüm rol izinlerini varsayılan değerlere sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.",
        destructive: true,
      }))
    )
      return;
    setPermissions(FALLBACK_DEFAULTS);
    setMatrixDirty(true);
  };

  const toggleGroupCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Personel aksiyonları ──

  const toggleAllowAdmin = async () => {
    const next = !allowAdminAssign;
    setAllowAdminAssign(next);
    try {
      await adminApi.setStaffSettings(next);
      toast.success(next ? "Yöneticiler artık rol atayabilir" : "Rol atama tekrar yalnızca süper adminde");
    } catch (err: any) {
      setAllowAdminAssign(!next);
      toast.error(err.response?.data?.message || "Ayar değiştirilemedi");
    }
  };

  const openAssign = () => {
    setEditing(null);
    setForm({ email: "", role: "moderator", password: "", displayName: "" });
    setShowModal(true);
  };

  const openEdit = (s: StaffItem) => {
    setEditing(s);
    setForm({ email: s.email, role: s.role, password: "", displayName: "" });
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateStaff(editing.id, { role: form.role });
        toast.success("Kullanıcı rolü güncellendi");
      } else {
        const res = await adminApi.assignStaff({
          email: form.email,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
          ...(form.displayName ? { displayName: form.displayName } : {}),
        });
        toast.success("Kullanıcıya rol atandı");
        if (res.data?.tempPassword) {
          setCreatedInfo({ email: form.email, password: res.data.tempPassword });
        }
      }
      setShowModal(false);
      await fetchStaff();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "İşlem başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (s: StaffItem) => {
    if (
      !(await confirm({
        description: `${s.email} kullanıcısının admin yetkisini kaldırmak istediğinize emin misiniz?`,
        destructive: true,
      }))
    )
      return;
    try {
      await adminApi.removeStaff(s.id);
      toast.success("Admin yetkisi kaldırıldı");
      await fetchStaff();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Kaldırma başarısız");
    }
  };

  const visibleStaff = roleFilter ? staff.filter((s) => s.role === roleFilter) : staff;

  const staffColumns: ColumnDef<StaffItem, any>[] = [
    {
      header: "Kullanıcı",
      cell: ({ row }) => <span className="font-medium text-heading">{row.original.name}</span>,
    },
    {
      header: "E-posta",
      cell: ({ row }) => <span className="text-muted">{row.original.email}</span>,
    },
    {
      header: "Rol",
      cell: ({ row }) => {
        const meta = ROLE_META[row.original.role as RoleId];
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${meta?.color ?? "bg-surface-alt text-muted"}`}>
            {meta?.label ?? row.original.role}
          </span>
        );
      },
    },
    {
      header: "İzin Sayısı",
      cell: ({ row }) => (
        <span className="text-sm text-muted tabular-nums">
          {row.original.role === "super_admin"
            ? "Tümü (kilitli)"
            : `${(permissions[row.original.role] ?? []).length} izin`}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            row.original.isActive ? "bg-success-500/10 text-success-500" : "bg-muted/10 text-muted"
          }`}
        >
          {row.original.isActive ? "Aktif" : "Pasif"}
        </span>
      ),
    },
    {
      header: "Son Giriş",
      cell: ({ row }) => <span className="text-muted">{formatDate(row.original.lastLoginAt)}</span>,
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton icon={PencilIcon} onClick={() => openEdit(row.original)} title="Düzenle" />
          <ActionIconButton
            icon={TrashIcon}
            onClick={() => handleRevoke(row.original)}
            title="Yetkiyi kaldır"
            variant="danger"
          />
        </ActionButtons>
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roller ve İzinler"
        description="Her rolün hangi işlemleri yapabileceğini görüntüleyin ve düzenleyin"
      />

      <AdminTabs
        tabs={[
          { key: "matrix", label: "İzin Matrisi", icon: ShieldCheckIcon },
          { key: "users", label: "Kullanıcı Atamaları", icon: UserGroupIcon },
        ]}
        value={activeTab}
        onChange={(k) => {
          setActiveTab(k as "matrix" | "users");
          if (k === "users") setRoleFilter(null);
        }}
      />

      {/* Geçici şifre uyarısı */}
      {createdInfo && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <strong>{createdInfo.email}</strong> için yeni hesap oluşturuldu. Geçici şifre:{" "}
            <code className="px-2 py-0.5 bg-surface-elevated rounded font-mono">{createdInfo.password}</code>
            {" "}— kullanıcıyla paylaşın (bu şifre bir daha gösterilmez).
          </div>
          <button type="button" onClick={() => setCreatedInfo(null)} className="text-warning-800 hover:opacity-70 shrink-0">
            ✕
          </button>
        </div>
      )}

      {/* ═══════════════ TAB: İzin Matrisi ══════════════════════════════════ */}
      {activeTab === "matrix" && (
        <div className="space-y-4">
          {/* Üst kontrol çubuğu */}
          <div className="admin-card flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-heading">İzin Matrisi</h3>
              <p className="text-sm text-muted mt-0.5">
                {isSuperAdmin
                  ? "Düzenle moduna geçerek her rolün izinlerini tıklayarak değiştirebilirsiniz."
                  : "İzin matrisini yalnızca Süper Admin düzenleyebilir."}
              </p>
            </div>
            {isSuperAdmin && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {editMode ? (
                  <>
                    <Button variant="secondary" onClick={resetToDefaults} disabled={matrixSaving} className="flex items-center gap-1.5">
                      <ArrowUturnLeftIcon className="w-4 h-4" />
                      Varsayılana Sıfırla
                    </Button>
                    <Button variant="secondary" onClick={cancelEdit} disabled={matrixSaving}>
                      İptal
                    </Button>
                    <Button onClick={saveMatrix} disabled={!matrixDirty || matrixSaving}>
                      {matrixSaving ? "Kaydediliyor…" : "Kaydet"}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setEditMode(true)} className="flex items-center gap-1.5">
                    <PencilIcon className="w-4 h-4" />
                    Düzenle
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Değişiklik uyarısı */}
          {editMode && matrixDirty && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-2.5 text-sm text-warning-800 flex items-center gap-2">
              <InformationCircleIcon className="w-4 h-4 shrink-0" />
              Kaydedilmemiş değişiklikler var.
            </div>
          )}

          {/* Rol açıklama kartları */}
          {!matrixLoading && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {ROLES.map((role) => {
                const meta = ROLE_META[role];
                const count = role === "super_admin" ? "Tümü" : `${(permissions[role] ?? []).length} izin`;
                return (
                  <div key={role} className={`rounded-lg border px-4 py-3 ${meta.color}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{meta.label}</span>
                      <span className="text-xs font-mono opacity-70">{count}</span>
                    </div>
                    <p className="text-xs opacity-80 leading-relaxed">{meta.description}</p>
                    {role === "super_admin" && (
                      <div className="flex items-center gap-1 mt-2 text-xs opacity-60">
                        <LockClosedIcon className="w-3 h-3" />
                        Kilitli — değiştirilemez
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Matris tablosu */}
          {matrixLoading ? (
            <div className="admin-card flex items-center justify-center h-40 text-muted text-sm">
              Yükleniyor…
            </div>
          ) : (
            <div className="admin-card overflow-x-auto p-0">
              <table className="w-full text-sm border-collapse">
                {/* Tablo başlığı */}
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted bg-surface-alt sticky left-0 z-10 min-w-[15rem] w-[40%]">
                      İzin / Açıklama
                    </th>
                    {ROLES.map((role) => (
                      <th key={role} className="px-4 py-3 text-center font-medium bg-surface-alt min-w-[8rem]">
                        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_META[role].color}`}>
                          {role === "super_admin" && <LockClosedIcon className="w-3 h-3" />}
                          {ROLE_META[role].label}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {PERMISSION_GROUPS.map((g) => {
                    const isCollapsed = collapsedGroups.has(g.id);
                    return (
                      <React.Fragment key={g.id}>
                        {/* ── Grup başlığı satırı ── */}
                        <tr className="bg-surface-alt/60 border-b border-border-subtle">
                          <td className="px-3 py-2 sticky left-0 bg-surface-alt/60 z-10">
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapse(g.id)}
                              className="flex items-center gap-2 font-semibold text-xs text-heading uppercase tracking-wide hover:text-primary-600 transition-colors w-full text-left"
                            >
                              {isCollapsed ? (
                                <ChevronRightIcon className="w-3.5 h-3.5 text-muted" />
                              ) : (
                                <ChevronDownIcon className="w-3.5 h-3.5 text-muted" />
                              )}
                              {g.group}
                              <span className="text-muted font-normal normal-case tracking-normal">
                                ({g.permissions.length} izin)
                              </span>
                            </button>
                          </td>

                          {/* Grup toplu seç/kaldır */}
                          {ROLES.map((role) => {
                            const state = groupCheckedState(g, role);
                            const locked = role === "super_admin";
                            return (
                              <td key={role} className="px-4 py-2 text-center bg-surface-alt/60">
                                {locked ? (
                                  <span className="text-xs text-success-600 font-medium">Tümü</span>
                                ) : editMode && isSuperAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleGroup(g, role, state !== "all")}
                                    title={state === "all" ? "Grubu kaldır" : "Grubu seç"}
                                    className={`w-5 h-5 rounded border-2 mx-auto flex items-center justify-center transition-colors ${
                                      state === "all"
                                        ? "bg-primary-600 border-primary-600 text-white"
                                        : state === "partial"
                                          ? "bg-primary-200 border-primary-400"
                                          : "border-border bg-surface hover:border-primary-400"
                                    }`}
                                  >
                                    {state === "all" && <CheckIcon className="w-3 h-3" />}
                                    {state === "partial" && (
                                      <span className="block w-2 h-0.5 bg-primary-600 rounded" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted">
                                    {g.permissions.filter((p) => hasPermission(role, p.key)).length}/{g.permissions.length}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {/* ── İzin satırları ── */}
                        {!isCollapsed &&
                          g.permissions.map((perm, pi) => {
                            const isExpanded = expandedPerm === perm.key;
                            const isLast = pi === g.permissions.length - 1;
                            return (
                              <React.Fragment key={perm.key}>
                                <tr
                                  className={`border-b transition-colors ${
                                    isLast ? "border-border-subtle" : "border-border-subtle"
                                  } ${isExpanded ? "bg-surface-alt/40" : "hover:bg-surface-alt/20"}`}
                                >
                                  {/* İzin adı + açıklama toggle */}
                                  <td className="px-4 py-2.5 sticky left-0 bg-inherit z-10">
                                    <div className="flex items-start gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedPerm(isExpanded ? null : perm.key)}
                                        className="mt-0.5 text-muted hover:text-primary-600 shrink-0"
                                        title="Açıklama"
                                      >
                                        <InformationCircleIcon className="w-4 h-4" />
                                      </button>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-medium text-heading text-sm">{perm.label}</span>
                                        </div>
                                        {isExpanded && (
                                          <div className="mt-1.5 space-y-1">
                                            <p className="text-xs text-muted leading-relaxed">{perm.description}</p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {perm.pages.map((page) => (
                                                <code key={page} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-alt text-muted font-mono">
                                                  {page}
                                                </code>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Her rol için checkbox / kilit / onay */}
                                  {ROLES.map((role) => {
                                    const checked = hasPermission(role, perm.key);
                                    const locked = role === "super_admin";
                                    const interactive = editMode && !locked && isSuperAdmin;

                                    return (
                                      <td key={role} className="px-4 py-2.5 text-center">
                                        {interactive ? (
                                          <button
                                            type="button"
                                            onClick={() => togglePermission(role, perm.key)}
                                            className={`w-6 h-6 rounded border-2 mx-auto flex items-center justify-center transition-all hover:scale-110 ${
                                              checked
                                                ? "bg-primary-600 border-primary-600 text-white shadow-sm"
                                                : "border-border bg-surface hover:border-primary-400 hover:bg-primary-50"
                                            }`}
                                            title={checked ? "Kaldır" : "Ekle"}
                                          >
                                            {checked && <CheckIcon className="w-3.5 h-3.5" />}
                                          </button>
                                        ) : locked ? (
                                          <span
                                            className="inline-flex items-center justify-center w-6 h-6 mx-auto rounded-full bg-success-500/15"
                                            title="Süper Admin her zaman bu izne sahiptir"
                                          >
                                            <LockClosedIcon className="w-3.5 h-3.5 text-success-600" />
                                          </span>
                                        ) : checked ? (
                                          <span className="inline-flex items-center justify-center w-6 h-6 mx-auto rounded-full bg-primary-500/10">
                                            <CheckIcon className="w-3.5 h-3.5 text-primary-600" />
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center justify-center w-6 h-6 mx-auto">
                                            <span className="block w-2 h-2 rounded-full bg-border" />
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              </React.Fragment>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Lejant */}
          {!matrixLoading && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted px-1">
              <span className="flex items-center gap-1.5">
                <span className="inline-flex w-5 h-5 rounded-full bg-success-500/15 items-center justify-center">
                  <LockClosedIcon className="w-3 h-3 text-success-600" />
                </span>
                Süper Admin — her zaman tam yetkili
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex w-5 h-5 rounded-full bg-primary-500/10 items-center justify-center">
                  <CheckIcon className="w-3 h-3 text-primary-600" />
                </span>
                İzin mevcut
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex w-5 h-5 items-center justify-center">
                  <span className="block w-2 h-2 rounded-full bg-border" />
                </span>
                İzin yok
              </span>
              <span className="flex items-center gap-1.5">
                <InformationCircleIcon className="w-4 h-4 text-muted" />
                İzin adının solundaki ikona tıklayarak açıklama görebilirsiniz
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ TAB: Kullanıcı Atamaları ════════════════════════════ */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="admin-card flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <h3 className="text-lg font-semibold text-heading">Yönetici Kullanıcılar</h3>
              {/* Rol filtre etiketleri */}
              <div className="flex items-center gap-1.5">
                {ROLES.map((r) => {
                  const meta = ROLE_META[r];
                  const active = roleFilter === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoleFilter(active ? null : r)}
                      className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                        active ? meta.color : "border-border text-muted hover:bg-surface-alt"
                      }`}
                    >
                      {meta.label} {roleCounts[r] ?? 0}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {isSuperAdmin && (
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowAdminAssign}
                    onChange={toggleAllowAdmin}
                    className="w-4 h-4 accent-primary-600"
                  />
                  Yöneticiler de atayabilsin
                </label>
              )}
              <Button onClick={openAssign} className="flex items-center">
                <PlusIcon className="w-5 h-5 mr-2 shrink-0" />
                Yönetici Ata
              </Button>
            </div>
          </div>

          <DataTable
            columns={staffColumns}
            data={visibleStaff}
            loading={staffLoading}
            emptyText={roleFilter ? "Bu rolde kullanıcı yok." : "Henüz admin kullanıcı yok."}
            getRowId={(s) => s.id}
          />
        </div>
      )}

      {/* ═══════════════ Atama / Düzenleme Modalı ════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-heading/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-surface-elevated rounded-xl max-w-md w-full border border-border shadow-2xl">
            <div className="px-6 pb-6 pt-5">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-heading leading-tight">
                  {editing ? "Rolü Güncelle" : "Kullanıcıya Rol Ata"}
                </h3>
                <Button variant="secondary" onClick={() => setShowModal(false)} className="text-muted hover:text-heading">
                  <span className="sr-only">Kapat</span>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Kullanıcı E-posta</label>
                  <Input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ornek@email.com"
                    disabled={!!editing}
                  />
                  <p className="text-xs text-muted mt-1">
                    {editing ? "E-posta adresi değiştirilemez." : "E-posta kayıtlı değilse hesap otomatik oluşturulur."}
                  </p>
                </div>

                {!editing && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Görünen Ad <span className="text-subtle">(yeni hesap için)</span>
                      </label>
                      <Input
                        type="text"
                        value={form.displayName}
                        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                        placeholder="Boş bırakılırsa e-postadan türetilir"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Başlangıç Şifresi <span className="text-subtle">(yeni hesap için)</span>
                      </label>
                      <Input
                        type="text"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="Boş bırakılırsa otomatik üretilir"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Atanacak Rol</label>
                  <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </Select>
                  {/* Seçili rol özet bilgisi */}
                  {form.role && (
                    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${ROLE_META[form.role as RoleId]?.color}`}>
                      <p className="font-medium">{ROLE_META[form.role as RoleId]?.label}</p>
                      <p className="opacity-80 mt-0.5">{ROLE_META[form.role as RoleId]?.description}</p>
                      {form.role !== "super_admin" && (
                        <p className="mt-1 opacity-70">
                          {(permissions[form.role] ?? []).length} izne sahip.{" "}
                          <button
                            type="button"
                            onClick={() => { setShowModal(false); setActiveTab("matrix"); }}
                            className="underline"
                          >
                            İzin matrisini gör →
                          </button>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-border">
                  <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>
                    İptal
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Kaydediliyor…" : editing ? "Güncelle" : "Ata"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
