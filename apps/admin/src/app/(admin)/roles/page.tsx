"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  ShieldCheckIcon,
  UserGroupIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Input, Select } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { adminApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { useConfirm } from "@/components/ConfirmProvider";

// Sistem rolleri SABİTtir (backend AdminRole enum'u: super_admin / admin / moderator).
const SYSTEM_ROLES = [
  {
    id: "super_admin",
    name: "Süper Admin",
    description: "Tam yetki — yönetici işlemlerinin tümü + sistem/finans ayarları.",
    abilities: [
      "Tüm yönetici yetkileri",
      "Komisyon & vergi ayarları",
      "Platform ayarları",
      "IP engelleme & denetim kayıtları",
      "Admin rol atama",
    ],
  },
  {
    id: "admin",
    name: "Yönetici",
    description: "Operasyon yönetimi — sistem ayarları hariç her şey.",
    abilities: [
      "Sipariş & ödeme yönetimi",
      "Kullanıcı ban / yasak kaldırma",
      "Raporlar & analitik",
      "İade & takas yönetimi",
      "İçerik moderasyonu",
    ],
  },
  {
    id: "moderator",
    name: "Moderatör",
    description: "Sadece içerik moderasyonu.",
    abilities: [
      "Ürün onay / red",
      "Mesaj moderasyonu",
      "Yorum / puan moderasyonu",
      "Destek talepleri",
      "Kullanıcı / ürün görüntüleme",
    ],
  },
];

const ROLE_NAME: Record<string, string> = {
  super_admin: "Süper Admin",
  admin: "Yönetici",
  moderator: "Moderatör",
};

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
    return new Date(v).toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export default function RolesPage() {
  const confirm = useConfirm();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === "super_admin";

  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({
    super_admin: 0,
    admin: 0,
    moderator: 0,
  });
  const [loading, setLoading] = useState(true);
  const [allowAdminAssign, setAllowAdminAssign] = useState(false);

  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  // Atama / düzenleme modalı
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StaffItem | null>(null);
  const [form, setForm] = useState({
    email: "",
    role: "moderator",
    password: "",
    displayName: "",
  });
  const [saving, setSaving] = useState(false);

  // Yeni hesap oluşturulduğunda gösterilecek geçici şifre bilgisi
  const [createdInfo, setCreatedInfo] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getStaff();
      setStaff(res.data?.items ?? []);
      setRoleCounts(
        res.data?.roleCounts ?? { super_admin: 0, admin: 0, moderator: 0 },
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Admin personeli yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await adminApi.getStaffSettings();
      setAllowAdminAssign(!!res.data?.allowAdminAssign);
    } catch {
      /* ayar okunamazsa varsayılan kapalı */
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchSettings();
  }, [fetchStaff, fetchSettings]);

  const toggleAllowAdmin = async () => {
    const next = !allowAdminAssign;
    setAllowAdminAssign(next); // iyimser
    try {
      await adminApi.setStaffSettings(next);
      toast.success(
        next
          ? "Yöneticiler artık rol atayabilir"
          : "Rol atama tekrar yalnızca süper adminde",
      );
    } catch (err: any) {
      setAllowAdminAssign(!next); // geri al
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
        // Yeni hesap oluşturulduysa geçici şifreyi göster
        if (res.data?.tempPassword) {
          setCreatedInfo({
            email: form.email,
            password: res.data.tempPassword,
          });
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

  const visibleStaff = roleFilter
    ? staff.filter((s) => s.role === roleFilter)
    : staff;

  const columns: ColumnDef<StaffItem, any>[] = [
    {
      header: "Kullanıcı",
      cell: ({ row }) => (
        <span className="font-medium text-heading">{row.original.name}</span>
      ),
    },
    {
      header: "E-posta",
      cell: ({ row }) => (
        <span className="text-muted">{row.original.email}</span>
      ),
    },
    {
      header: "Rol",
      cell: ({ row }) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            row.original.role === "super_admin"
              ? "bg-danger-500/10 text-danger-500"
              : row.original.role === "admin"
                ? "bg-primary-500/10 text-primary-500"
                : "bg-info-500/10 text-info-500"
          }`}
        >
          {ROLE_NAME[row.original.role] ?? row.original.role}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            row.original.isActive
              ? "bg-success-500/10 text-success-500"
              : "bg-muted/10 text-muted"
          }`}
        >
          {row.original.isActive ? "Aktif" : "Pasif"}
        </span>
      ),
    },
    {
      header: "Son Giriş",
      cell: ({ row }) => (
        <span className="text-muted">{formatDate(row.original.lastLoginAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <div className="text-right whitespace-nowrap">
          <Button
            variant="secondary"
            onClick={() => openEdit(row.original)}
            className="text-info-700 hover:text-info-300 font-medium text-sm mr-2"
          >
            Düzenle
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleRevoke(row.original)}
            className="p-1.5 hover:bg-surface-alt rounded"
            title="Yetkiyi kaldır"
          >
            <TrashIcon className="w-4 h-4 text-danger-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Başlık + sekmeler */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Roller ve İzinler</h1>
          <p className="text-muted mt-1">
            Sistem erişim seviyelerini ve kullanıcı rollerini yönetin
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === "roles" ? "primary" : "secondary"}
            onClick={() => setActiveTab("roles")}
            className="flex items-center"
          >
            <ShieldCheckIcon className="w-5 h-5 mr-2" />
            Rol Tanımları
          </Button>
          <Button
            variant={activeTab === "users" ? "primary" : "secondary"}
            onClick={() => {
              setRoleFilter(null);
              setActiveTab("users");
            }}
            className="flex items-center"
          >
            <UserGroupIcon className="w-5 h-5 mr-2" />
            Kullanıcı Atamaları
          </Button>
        </div>
      </div>

      {/* Yeni hesap geçici şifre uyarısı */}
      {createdInfo && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 flex items-start justify-between gap-4">
          <div>
            <strong>{createdInfo.email}</strong> için yeni hesap oluşturuldu.
            Geçici şifre:{" "}
            <code className="px-2 py-0.5 bg-surface-elevated rounded font-mono">
              {createdInfo.password}
            </code>{" "}
            — kullanıcıyla paylaşın (bu şifre bir daha gösterilmez).
          </div>
          <button
            type="button"
            onClick={() => setCreatedInfo(null)}
            className="text-warning-800 hover:opacity-70 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {activeTab === "roles" ? (
        /* ─────────── Rol kartları (tıklanınca o roldeki kullanıcılar) ─────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SYSTEM_ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                setRoleFilter(role.id);
                setActiveTab("users");
              }}
              className="admin-card relative text-left flex flex-col h-full hover:ring-2 hover:ring-primary-400 transition-shadow cursor-pointer"
            >
              <div className="mb-3">
                <h3 className="text-lg font-semibold text-heading">
                  {role.name}
                </h3>
                <span className="text-sm text-primary-600 font-medium">
                  {loading ? "…" : (roleCounts[role.id] ?? 0)} kullanıcı →
                  görüntüle
                </span>
                <span className="ml-2 text-xs bg-surface-alt text-muted px-2 py-0.5 rounded">
                  Sistem rolü
                </span>
              </div>
              <p className="text-muted text-sm mb-4 flex-grow">
                {role.description}
              </p>
              <div className="mt-auto">
                <h4 className="text-xs font-medium text-muted uppercase mb-2">
                  Yetkiler
                </h4>
                <div className="flex flex-wrap gap-2">
                  {role.abilities.map((a) => (
                    <span
                      key={a}
                      className="text-xs px-2 py-1 rounded bg-surface-alt text-muted"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* ─────────── Kullanıcı atamaları (gerçek admin personeli) ─────────── */
        <div className="space-y-4">
          <div className="admin-card flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-heading">
                Yönetici Kullanıcılar
              </h3>
              {roleFilter && (
                <span className="text-sm text-muted">
                  Filtre: <strong>{ROLE_NAME[roleFilter]}</strong>
                  <button
                    type="button"
                    onClick={() => setRoleFilter(null)}
                    className="ml-2 text-primary-600 hover:text-primary-700"
                  >
                    (temizle)
                  </button>
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* Süper admin: yöneticilere atama izni ver/al */}
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
                <PlusIcon className="w-5 h-5 mr-2" />
                Yönetici Ata
              </Button>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={visibleStaff}
            loading={loading}
            emptyText={
              roleFilter
                ? "Bu rolde kullanıcı yok."
                : "Henüz admin kullanıcı yok."
            }
            getRowId={(s) => s.id}
          />
        </div>
      )}

      {/* Atama / Düzenleme modalı */}
      {showModal && (
        <div className="fixed inset-0 bg-heading/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-surface-elevated rounded-xl max-w-md w-full border border-border shadow-2xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-heading">
                  {editing ? "Rolü Güncelle" : "Kullanıcıya Rol Ata"}
                </h3>
                <Button
                  variant="secondary"
                  onClick={() => setShowModal(false)}
                  className="text-muted hover:text-heading"
                >
                  <span className="sr-only">Kapat</span>
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Kullanıcı E-posta
                  </label>
                  <Input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="ornek@email.com"
                    disabled={!!editing}
                  />
                  {editing ? (
                    <p className="text-xs text-muted mt-1">
                      E-posta adresi değiştirilemez.
                    </p>
                  ) : (
                    <p className="text-xs text-muted mt-1">
                      E-posta kayıtlı değilse hesap otomatik oluşturulur.
                    </p>
                  )}
                </div>

                {/* Yeni hesap için opsiyonel alanlar */}
                {!editing && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Görünen Ad{" "}
                        <span className="text-subtle">(yeni hesap için)</span>
                      </label>
                      <Input
                        type="text"
                        value={form.displayName}
                        onChange={(e) =>
                          setForm({ ...form, displayName: e.target.value })
                        }
                        placeholder="Boş bırakılırsa e-postadan türetilir"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Başlangıç Şifresi{" "}
                        <span className="text-subtle">(yeni hesap için)</span>
                      </label>
                      <Input
                        type="text"
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        placeholder="Boş bırakılırsa otomatik üretilir"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Atanacak Rol
                  </label>
                  <Select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {SYSTEM_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-3 justify-end pt-4 border-t border-border">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setShowModal(false)}
                  >
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
