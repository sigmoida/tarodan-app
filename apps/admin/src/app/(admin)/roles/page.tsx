"use client";

import { useState } from "react";
import {
  ShieldCheckIcon,
  UserGroupIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import { Button, Checkbox, Input, Select, Textarea } from "@tarodan/ui";

// Mock data for roles and permissions
const AVAILABLE_PERMISSIONS = [
  { id: "users.view", label: "Kullanıcıları Görüntüle", group: "Kullanıcılar" },
  { id: "users.manage", label: "Kullanıcıları Yönet", group: "Kullanıcılar" },
  { id: "products.view", label: "Ürünleri Görüntüle", group: "Ürünler" },
  { id: "products.manage", label: "Ürünleri Yönet", group: "Ürünler" },
  { id: "orders.view", label: "Siparişleri Görüntüle", group: "Siparişler" },
  { id: "orders.manage", label: "Siparişleri Yönet", group: "Siparişler" },
  { id: "settings.view", label: "Ayarları Görüntüle", group: "Ayarlar" },
  { id: "settings.manage", label: "Ayarları Yönet", group: "Ayarlar" },
  { id: "roles.manage", label: "Rolleri Yönet", group: "Ayarlar" },
];

const INITIAL_ROLES = [
  {
    id: "super_admin",
    name: "Süper Admin",
    description: "Tam yetkili yönetici",
    permissions: AVAILABLE_PERMISSIONS.map((p) => p.id),
    usersCount: 2,
    isSystem: true,
  },
  {
    id: "admin",
    name: "Yönetici",
    description: "Genel yönetim yetkisi",
    permissions: [
      "users.view",
      "users.manage",
      "products.view",
      "products.manage",
      "orders.view",
      "orders.manage",
    ],
    usersCount: 5,
    isSystem: true,
  },
  {
    id: "moderator",
    name: "Moderatör",
    description: "İçerik ve kullanıcı denetimi",
    permissions: ["users.view", "products.view", "products.manage"],
    usersCount: 12,
    isSystem: false,
  },
];

const INITIAL_ADMIN_USERS = [
  {
    id: "1",
    name: "Görkem",
    email: "gorkem@tarotaro.com",
    role: "super_admin",
    status: "active",
    lastLogin: "2024-02-09 18:30",
  },
  {
    id: "2",
    name: "Ahmet",
    email: "ahmet@tarotaro.com",
    role: "admin",
    status: "active",
    lastLogin: "2024-02-08 14:20",
  },
  {
    id: "3",
    name: "Ayşe",
    email: "ayse@tarotaro.com",
    role: "moderator",
    status: "inactive",
    lastLogin: "2024-01-15 09:45",
  },
];

export default function RolesPage() {
  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");
  const [roles, setRoles] = useState(INITIAL_ROLES);
  const [adminUsers, setAdminUsers] = useState(INITIAL_ADMIN_USERS);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  // Role Form State
  const [editingRole, setEditingRole] = useState<any>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });

  // User Assignment Form State
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ email: "", role: "moderator" });

  const handleEditRole = (role: any) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    });
    setShowRoleModal(true);
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: "", description: "", permissions: [] });
    setShowRoleModal(true);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRole) {
      setRoles(
        roles.map((r) => (r.id === editingRole.id ? { ...r, ...roleForm } : r)),
      );
      toast.success("Rol güncellendi");
    } else {
      const newRole = {
        id: roleForm.name.toLowerCase().replace(/\s+/g, "_"),
        ...roleForm,
        usersCount: 0,
        isSystem: false,
      };
      setRoles([...roles, newRole]);
      toast.success("Yeni rol oluşturuldu");
    }
    setShowRoleModal(false);
  };

  const handleDeleteRole = (roleId: string) => {
    if (confirm("Bu rolü silmek istediğinize emin misiniz?")) {
      setRoles(roles.filter((r) => r.id !== roleId));
      toast.success("Rol silindi");
    }
  };

  const togglePermission = (permissionId: string) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter((p) => p !== permissionId)
        : [...prev.permissions, permissionId],
    }));
  };

  const handleAssignUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      setAdminUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id ? { ...u, role: userForm.role } : u,
        ),
      );
      toast.success("Kullanıcı rolü güncellendi");
    } else {
      toast.success("Kullanıcıya rol atandı");
    }
    setShowUserModal(false);
  };

  // Group permissions by category
  const groupedPermissions: Record<string, typeof AVAILABLE_PERMISSIONS> = {};
  AVAILABLE_PERMISSIONS.forEach((perm) => {
    if (!groupedPermissions[perm.group]) {
      groupedPermissions[perm.group] = [];
    }
    groupedPermissions[perm.group].push(perm);
  });

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Roller ve İzinler
            </h1>
            <p className="text-gray-500 mt-1">
              Sistem erişim seviyelerini ve kullanıcı rollerini yönetin
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setActiveTab("roles")}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center ${
                activeTab === "roles"
                  ? "bg-primary-600 text-gray-900"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <ShieldCheckIcon className="w-5 h-5 mr-2" />
              Rol Tanımları
            </Button>
            <Button
              variant="secondary"
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center ${
                activeTab === "users"
                  ? "bg-primary-600 text-gray-900"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <UserGroupIcon className="w-5 h-5 mr-2" />
              Kullanıcı Atamaları
            </Button>
          </div>
        </div>

        {activeTab === "roles" ? (
          /* Roles List */
          <div className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={handleCreateRole} className="flex">
                <PlusIcon className="w-5 h-5 mr-2" />
                Yeni Rol Ekle
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="admin-card relative group flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {role.name}
                      </h3>
                      <div className="flex items-center mt-1">
                        <span className="text-sm text-gray-500">
                          {role.usersCount} Kullanıcı
                        </span>
                        {role.isSystem && (
                          <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                            Sistem
                          </span>
                        )}
                      </div>
                    </div>
                    {!role.isSystem && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleEditRole(role)}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                          title="Düzenle"
                        >
                          <PencilIcon className="w-4 h-4 text-info-700" />
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleDeleteRole(role.id)}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                          title="Sil"
                        >
                          <TrashIcon className="w-4 h-4 text-danger-600" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <p className="text-gray-600 text-sm mb-4 flex-grow">
                    {role.description}
                  </p>

                  <div className="mt-auto">
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                      İzinler
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {role.permissions.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600"
                        >
                          {AVAILABLE_PERMISSIONS.find((ap) => ap.id === p)
                            ?.label || p}
                        </span>
                      ))}
                      {role.permissions.length > 3 && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">
                          +{role.permissions.length - 3} daha
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* User Assignments */
          <div className="admin-card overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white/50">
              <h3 className="text-lg font-semibold text-gray-900">
                Yönetici Kullanıcılar
              </h3>
              <Button
                onClick={() => {
                  setEditingUser(null);
                  setUserForm({ email: "", role: "moderator" });
                  setShowUserModal(true);
                }}
                className="flex"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Yönetici Ata
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="admin-table w-full">
                <thead>
                  <tr>
                    <th className="text-left p-4">Kullanıcı</th>
                    <th className="text-left p-4">E-posta</th>
                    <th className="text-left p-4">Rol</th>
                    <th className="text-left p-4">Durum</th>
                    <th className="text-left p-4">Son Giriş</th>
                    <th className="text-right p-4">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-200 hover:bg-gray-100/50"
                    >
                      <td className="p-4 font-medium text-gray-900">
                        {user.name}
                      </td>
                      <td className="p-4 text-gray-500">{user.email}</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.role === "super_admin"
                              ? "bg-danger-500/10 text-danger-500"
                              : user.role === "admin"
                                ? "bg-primary-500/10 text-primary-500"
                                : "bg-info-500/10 text-info-500"
                          }`}
                        >
                          {roles.find((r) => r.id === user.role)?.name ||
                            user.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.status === "active"
                              ? "bg-success-500/10 text-success-500"
                              : "bg-gray-500/10 text-gray-500"
                          }`}
                        >
                          {user.status === "active" ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500">{user.lastLogin}</td>
                      <td className="p-4 text-right">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingUser(user);
                            setUserForm({ email: user.email, role: user.role });
                            setShowUserModal(true);
                          }}
                          className="text-info-700 hover:text-info-300 font-medium text-sm"
                        >
                          Düzenle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create/Edit Role Modal */}
        {showRoleModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 shadow-2xl">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900">
                    {editingRole ? "Rolü Düzenle" : "Yeni Rol Oluştur"}
                  </h3>
                  <Button
                    variant="secondary"
                    onClick={() => setShowRoleModal(false)}
                    className="text-gray-500 hover:text-gray-900"
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

                <form onSubmit={handleSaveRole} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Rol Adı
                    </label>
                    <Input
                      type="text"
                      required
                      value={roleForm.name}
                      onChange={(e) =>
                        setRoleForm({ ...roleForm, name: e.target.value })
                      }
                      placeholder="Örn: Editör"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Açıklama
                    </label>
                    <Textarea
                      required
                      value={roleForm.description}
                      onChange={(e) =>
                        setRoleForm({
                          ...roleForm,
                          description: e.target.value,
                        })
                      }
                      rows={3}
                      placeholder="Bu rolün yetkilerini kısaca açıklayın"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-3 block">
                      İzinler
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {Object.entries(groupedPermissions).map(
                        ([group, perms]) => (
                          <div key={group} className="bg-gray-100/50 p-4">
                            <h4 className="font-medium text-gray-900 mb-3 text-sm">
                              {group}
                            </h4>
                            <div className="space-y-2">
                              {perms.map((perm) => {
                                const isChecked = roleForm.permissions.includes(
                                  perm.id,
                                );
                                return (
                                  <label
                                    key={perm.id}
                                    className="flex items-start gap-3 cursor-pointer group"
                                  >
                                    <div
                                      className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                        isChecked
                                          ? "bg-primary-600 border-primary-600"
                                          : "border-gray-500 group-hover:border-gray-400 bg-white"
                                      }`}
                                    >
                                      {isChecked && (
                                        <CheckIcon className="w-3.5 h-3.5 text-gray-900 stroke-2" />
                                      )}
                                    </div>
                                    <Checkbox
                                      className="hidden"
                                      checked={isChecked}
                                      onChange={() => togglePermission(perm.id)}
                                    />
                                    <span
                                      className={`text-sm select-none ${isChecked ? "text-gray-900" : "text-gray-500 group-hover:text-gray-600"}`}
                                    >
                                      {perm.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setShowRoleModal(false)}
                    >
                      İptal
                    </Button>
                    <Button type="submit">
                      {editingRole ? "Güncelle" : "Oluştur"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Assign User Modal */}
        {showUserModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl max-w-md w-full border border-gray-200 shadow-2xl">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900">
                    {editingUser ? "Rolü Güncelle" : "Kullanıcıya Rol Ata"}
                  </h3>
                  <Button
                    variant="secondary"
                    onClick={() => setShowUserModal(false)}
                    className="text-gray-500 hover:text-gray-900"
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

                <form onSubmit={handleAssignUser} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Kullanıcı E-posta
                    </label>
                    <Input
                      type="email"
                      required
                      value={userForm.email}
                      onChange={(e) =>
                        setUserForm({ ...userForm, email: e.target.value })
                      }
                      placeholder="ornek@email.com"
                      disabled={!!editingUser}
                    />
                    {editingUser && (
                      <p className="text-xs text-gray-500 mt-1">
                        E-posta adresi değiştirilemez.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Atanacak Rol
                    </label>
                    <Select
                      value={userForm.role}
                      onChange={(e) =>
                        setUserForm({ ...userForm, role: e.target.value })
                      }
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setShowUserModal(false)}
                    >
                      İptal
                    </Button>
                    <Button type="submit">
                      {editingUser ? "Güncelle" : "Ata"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
