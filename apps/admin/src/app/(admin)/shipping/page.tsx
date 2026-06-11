"use client";

import { useState, useEffect, useCallback } from "react";
import { adminApi } from "@/lib/api";
import { AdminTabs } from "@/components/AdminTabs";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import {
  Button,
  Checkbox,
  Input,
  Select,
  StatusBadge,
  Textarea,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import {
  TruckIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  BanknotesIcon,
  TagIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  PrinterIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ConfirmProvider";

type TabType = "methods" | "carriers" | "zones" | "rates" | "labels";

// Interfaces
interface ShippingMethod {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
}

interface ShippingCarrier {
  id: string;
  name: string;
  code: string;
  logo?: string;
  trackingUrl?: string;
  isActive: boolean;
}

interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  isActive: boolean;
}

interface ShippingRate {
  id: string;
  zoneId: string;
  methodId: string;
  carrierId: string;
  basePrice: number;
  pricePerKg: number;
  freeShippingMin?: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  isActive: boolean;
  zone?: { name: string };
  method?: { name: string };
  carrier?: { name: string };
}

interface Shipment {
  id: string;
  orderId: string;
  carrierId: string;
  trackingNumber?: string;
  status: string;
  labelUrl?: string;
  createdAt: string;
  order?: {
    orderNumber: string;
    buyer?: {
      displayName: string;
    };
  };
  carrier?: {
    name: string;
  };
}

export default function ShippingPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabType>("methods");
  const [loading, setLoading] = useState(false);

  // Data states
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [carriers, setCarriers] = useState<ShippingCarrier[]>([]);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form data
  const [formData, setFormData] = useState<any>({});

  // Selected for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const tabs = [
    { key: "methods", label: "Yöntemler", icon: TruckIcon },
    { key: "carriers", label: "Firmalar", icon: BuildingOfficeIcon },
    { key: "zones", label: "Bölgeler", icon: GlobeAltIcon },
    { key: "rates", label: "Ücretler", icon: BanknotesIcon },
    { key: "labels", label: "Etiketler", icon: TagIcon },
  ];

  // Load data based on active tab
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case "methods":
          const methodsRes = await adminApi.getShippingMethods();
          setMethods(methodsRes.data?.data || methodsRes.data || []);
          break;
        case "carriers":
          const carriersRes = await adminApi.getShippingCarriers();
          setCarriers(carriersRes.data?.data || carriersRes.data || []);
          break;
        case "zones":
          const zonesRes = await adminApi.getShippingZones();
          setZones(zonesRes.data?.data || zonesRes.data || []);
          break;
        case "rates":
          const [ratesRes, zRes, mRes, cRes] = await Promise.all([
            adminApi.getShippingRates(),
            adminApi.getShippingZones(),
            adminApi.getShippingMethods(),
            adminApi.getShippingCarriers(),
          ]);
          setRates(ratesRes.data?.data || ratesRes.data || []);
          setZones(zRes.data?.data || zRes.data || []);
          setMethods(mRes.data?.data || mRes.data || []);
          setCarriers(cRes.data?.data || cRes.data || []);
          break;
        case "labels":
          const shipmentsRes = await adminApi.getShipments({
            page: 1,
            limit: 50,
          });
          setShipments(shipmentsRes.data?.data || shipmentsRes.data || []);
          break;
      }
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open modal for create/edit
  const openModal = (item?: any) => {
    if (item) {
      setEditing(item);
      setFormData({ ...item });
    } else {
      setEditing(null);
      switch (activeTab) {
        case "methods":
          setFormData({ name: "", code: "", description: "", isActive: true });
          break;
        case "carriers":
          setFormData({
            name: "",
            code: "",
            logo: "",
            trackingUrl: "",
            apiKey: "",
            apiSecret: "",
            isActive: true,
          });
          break;
        case "zones":
          setFormData({ name: "", countries: [], isActive: true });
          break;
        case "rates":
          setFormData({
            zoneId: zones[0]?.id || "",
            methodId: methods[0]?.id || "",
            carrierId: carriers[0]?.id || "",
            basePrice: 0,
            pricePerKg: 0,
            freeShippingMin: undefined,
            minDeliveryDays: 1,
            maxDeliveryDays: 3,
            isActive: true,
          });
          break;
      }
    }
    setShowModal(true);
  };

  // Save handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      switch (activeTab) {
        case "methods":
          if (editing) {
            await adminApi.updateShippingMethod(editing.id, formData);
          } else {
            await adminApi.createShippingMethod(formData);
          }
          break;
        case "carriers":
          if (editing) {
            await adminApi.updateShippingCarrier(editing.id, formData);
          } else {
            await adminApi.createShippingCarrier(formData);
          }
          break;
        case "zones":
          if (editing) {
            await adminApi.updateShippingZone(editing.id, formData);
          } else {
            await adminApi.createShippingZone(formData);
          }
          break;
        case "rates":
          if (editing) {
            await adminApi.updateShippingRate(editing.id, formData);
          } else {
            await adminApi.createShippingRate(formData);
          }
          break;
      }
      toast.success(editing ? "Güncellendi" : "Oluşturuldu");
      setShowModal(false);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Delete handler
  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: "Silmek istediğinizden emin misiniz?", destructive: true }))) return;
    try {
      switch (activeTab) {
        case "methods":
          await adminApi.deleteShippingMethod(id);
          break;
        case "carriers":
          await adminApi.deleteShippingCarrier(id);
          break;
        case "zones":
          await adminApi.deleteShippingZone(id);
          break;
        case "rates":
          await adminApi.deleteShippingRate(id);
          break;
      }
      toast.success("Silindi");
      loadData();
    } catch (error: any) {
      toast.error("Silme başarısız");
    }
  };

  // Label generation
  const handleGenerateLabel = async (id: string) => {
    try {
      const res = await adminApi.generateShippingLabel(id);
      toast.success("Etiket oluşturuldu");
      loadData();
      if (res.data?.labelUrl) {
        window.open(res.data.labelUrl, "_blank");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Etiket oluşturma hatası");
    }
  };

  const handleBulkGenerateLabels = async () => {
    if (selectedIds.length === 0) return;
    try {
      await adminApi.bulkGenerateShippingLabels(selectedIds);
      toast.success(`${selectedIds.length} etiket oluşturuldu`);
      setSelectedIds([]);
      loadData();
    } catch (error: any) {
      toast.error("Toplu etiket oluşturma hatası");
    }
  };

  const shippingStatusConfig: Record<string, StatusConfig> = {
    pending: { label: "Bekliyor", variant: "warning" },
    label_generated: { label: "Etiket Hazır", variant: "info" },
    shipped: { label: "Kargolandı", variant: "success" },
    delivered: { label: "Teslim Edildi", variant: "success" },
  };

  // Render form fields based on active tab
  const renderFormFields = () => {
    switch (activeTab) {
      case "methods":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Ad *
              </label>
              <Input
                type="text"
                value={formData.name || ""}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Kod *
              </label>
              <Input
                type="text"
                value={formData.code || ""}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Açıklama
              </label>
              <Textarea
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                label="Aktif"
              />
            </div>
          </>
        );

      case "carriers":
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Ad *
                </label>
                <Input
                  type="text"
                  value={formData.name || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Kod *
                </label>
                <Input
                  type="text"
                  value={formData.code || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Logo URL
              </label>
              <Input
                type="text"
                value={formData.logo || ""}
                onChange={(e) =>
                  setFormData({ ...formData, logo: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Takip URL
              </label>
              <Input
                type="text"
                value={formData.trackingUrl || ""}
                onChange={(e) =>
                  setFormData({ ...formData, trackingUrl: e.target.value })
                }
                placeholder="https://tracking.example.com/?no={trackingNumber}"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  API Key
                </label>
                <Input
                  type="password"
                  value={formData.apiKey || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, apiKey: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  API Secret
                </label>
                <Input
                  type="password"
                  value={formData.apiSecret || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, apiSecret: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                label="Aktif"
              />
            </div>
          </>
        );

      case "zones":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Bölge Adı *
              </label>
              <Input
                type="text"
                value={formData.name || ""}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Ülkeler (virgülle ayırın)
              </label>
              <Input
                type="text"
                value={
                  Array.isArray(formData.countries)
                    ? formData.countries.join(", ")
                    : ""
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    countries: e.target.value
                      .split(",")
                      .map((s: string) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="TR, DE, FR"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                label="Aktif"
              />
            </div>
          </>
        );

      case "rates":
        return (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Bölge *
                </label>
                <Select
                  value={formData.zoneId || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, zoneId: e.target.value })
                  }
                  required
                >
                  <option value="">Seçin</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Yöntem *
                </label>
                <Select
                  value={formData.methodId || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, methodId: e.target.value })
                  }
                  required
                >
                  <option value="">Seçin</option>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Firma *
                </label>
                <Select
                  value={formData.carrierId || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, carrierId: e.target.value })
                  }
                  required
                >
                  <option value="">Seçin</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Baz Fiyat (₺) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.basePrice || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      basePrice: parseFloat(e.target.value),
                    })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  KG Başı (₺)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.pricePerKg || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pricePerKg: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Ücretsiz Kargo Limiti (₺)
              </label>
              <Input
                type="number"
                step="0.01"
                value={formData.freeShippingMin || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    freeShippingMin: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
                placeholder="Boş bırakılabilir"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Min. Teslimat (Gün)
                </label>
                <Input
                  type="number"
                  value={formData.minDeliveryDays || 1}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      minDeliveryDays: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Max. Teslimat (Gün)
                </label>
                <Input
                  type="number"
                  value={formData.maxDeliveryDays || 3}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxDeliveryDays: parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                label="Aktif"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // ── Column definitions (one set per tab) ──
  const methodColumns: ColumnDef<ShippingMethod, any>[] = [
    {
      header: "Ad",
      cell: ({ row }) => (
        <span className="font-medium text-heading">{row.original.name}</span>
      ),
    },
    {
      header: "Kod",
      cell: ({ row }) => (
        <code className="text-primary-400">{row.original.code}</code>
      ),
    },
    {
      header: "Açıklama",
      cell: ({ row }) => (
        <span className="text-muted max-w-xs truncate">
          {row.original.description || "-"}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="badge badge-success">Aktif</span>
        ) : (
          <span className="badge badge-gray">Pasif</span>
        ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => openModal(row.original)}
            className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleDelete(row.original.id)}
            className="p-2 text-danger-600 hover:text-danger-300 hover:bg-danger-500/10 rounded-lg"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const carrierColumns: ColumnDef<ShippingCarrier, any>[] = [
    {
      header: "Firma",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.logo && (
            <img
              src={row.original.logo}
              alt=""
              className="h-8 w-8 object-contain rounded"
            />
          )}
          <span className="font-medium text-heading">{row.original.name}</span>
        </div>
      ),
    },
    {
      header: "Kod",
      cell: ({ row }) => (
        <code className="text-primary-400">{row.original.code}</code>
      ),
    },
    {
      header: "Takip URL",
      cell: ({ row }) => (
        <span className="text-muted max-w-xs truncate">
          {row.original.trackingUrl || "-"}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="badge badge-success">Aktif</span>
        ) : (
          <span className="badge badge-gray">Pasif</span>
        ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => openModal(row.original)}
            className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleDelete(row.original.id)}
            className="p-2 text-danger-600 hover:text-danger-300 hover:bg-danger-500/10 rounded-lg"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const zoneColumns: ColumnDef<ShippingZone, any>[] = [
    {
      header: "Bölge Adı",
      cell: ({ row }) => (
        <span className="font-medium text-heading">{row.original.name}</span>
      ),
    },
    {
      header: "Ülkeler",
      cell: ({ row }) => (
        <span className="text-muted">
          {row.original.countries?.join(", ") || "-"}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="badge badge-success">Aktif</span>
        ) : (
          <span className="badge badge-gray">Pasif</span>
        ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => openModal(row.original)}
            className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleDelete(row.original.id)}
            className="p-2 text-danger-600 hover:text-danger-300 hover:bg-danger-500/10 rounded-lg"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const rateColumns: ColumnDef<ShippingRate, any>[] = [
    {
      header: "Bölge",
      cell: ({ row }) => (
        <span className="font-medium text-heading">
          {row.original.zone?.name || "-"}
        </span>
      ),
    },
    {
      header: "Yöntem",
      cell: ({ row }) => (
        <span className="text-muted">{row.original.method?.name || "-"}</span>
      ),
    },
    {
      header: "Firma",
      cell: ({ row }) => (
        <span className="text-muted">{row.original.carrier?.name || "-"}</span>
      ),
    },
    {
      header: "Fiyat",
      cell: ({ row }) => (
        <>
          <span className="text-primary-400 font-semibold">
            ₺{row.original.basePrice?.toLocaleString()}
          </span>
          {row.original.pricePerKg > 0 && (
            <span className="text-xs text-muted ml-1">
              (+₺{row.original.pricePerKg}/kg)
            </span>
          )}
        </>
      ),
    },
    {
      header: "Teslimat",
      cell: ({ row }) => (
        <span className="text-muted">
          {row.original.minDeliveryDays}-{row.original.maxDeliveryDays} gün
        </span>
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => openModal(row.original)}
            className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleDelete(row.original.id)}
            className="p-2 text-danger-600 hover:text-danger-300 hover:bg-danger-500/10 rounded-lg"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const labelColumns: ColumnDef<Shipment, any>[] = [
    {
      header: "Sipariş",
      cell: ({ row }) => (
        <span className="font-medium text-primary-400">
          #{row.original.order?.orderNumber || "-"}
        </span>
      ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) => (
        <span className="text-heading">
          {row.original.order?.buyer?.displayName || "-"}
        </span>
      ),
    },
    {
      header: "Kargo",
      cell: ({ row }) => (
        <span className="text-muted">{row.original.carrier?.name || "-"}</span>
      ),
    },
    {
      header: "Takip No",
      cell: ({ row }) => (
        <code className="text-xs text-muted">
          {row.original.trackingNumber || "-"}
        </code>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <StatusBadge
          status={(row.original.status || "").toLowerCase()}
          config={shippingStatusConfig}
        />
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) =>
        row.original.labelUrl ? (
          <a
            href={row.original.labelUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 text-info-700 hover:text-info-300 hover:bg-info-500/10 rounded-lg inline-flex"
          >
            <PrinterIcon className="h-4 w-4" />
          </a>
        ) : (
          <Button
            variant="secondary"
            onClick={() => handleGenerateLabel(row.original.id)}
            className="p-2 text-primary-400 hover:text-primary-300 hover:bg-primary-50 rounded-lg"
          >
            <TagIcon className="h-4 w-4" />
          </Button>
        ),
    },
  ];

  // Render table based on active tab
  const renderTable = () => {
    switch (activeTab) {
      case "methods":
        return (
          <DataTable
            columns={methodColumns}
            data={methods}
            loading={loading}
            emptyText="Kayıt bulunamadı"
            getRowId={(r) => r.id}
          />
        );

      case "carriers":
        return (
          <DataTable
            columns={carrierColumns}
            data={carriers}
            loading={loading}
            emptyText="Kayıt bulunamadı"
            getRowId={(r) => r.id}
          />
        );

      case "zones":
        return (
          <DataTable
            columns={zoneColumns}
            data={zones}
            loading={loading}
            emptyText="Kayıt bulunamadı"
            getRowId={(r) => r.id}
          />
        );

      case "rates":
        return (
          <DataTable
            columns={rateColumns}
            data={rates}
            loading={loading}
            emptyText="Kayıt bulunamadı"
            getRowId={(r) => r.id}
          />
        );

      case "labels":
        return (
          <>
            {selectedIds.length > 0 && (
              <div className="mb-4 flex items-center gap-4 p-4 bg-surface-alt rounded-lg">
                <span className="text-muted">
                  {selectedIds.length} gönderi seçildi
                </span>
                <Button onClick={handleBulkGenerateLabels}>
                  <PrinterIcon className="h-4 w-4 mr-2" />
                  Toplu Etiket Oluştur
                </Button>
              </div>
            )}
            <DataTable
              columns={labelColumns}
              data={shipments}
              loading={loading}
              emptyText="Gönderi bulunamadı"
              getRowId={(r) => r.id}
              selectable
              selectedIds={selectedIds}
              onToggleRow={(id) =>
                setSelectedIds((prev) =>
                  prev.includes(id)
                    ? prev.filter((x) => x !== id)
                    : [...prev, id],
                )
              }
              onToggleAll={(ids) =>
                setSelectedIds((prev) =>
                  prev.length === ids.length ? [] : ids,
                )
              }
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-heading">Kargo Yönetimi</h1>
            <p className="text-muted mt-1">
              Kargo yöntemleri, firmaları, bölgeleri ve ücretleri yönetin
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadData}>
              <ArrowPathIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            {activeTab !== "labels" && (
              <Button onClick={() => openModal()}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Yeni Ekle
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <AdminTabs
          tabs={tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
          value={activeTab}
          onChange={(k) => setActiveTab(k as TabType)}
        />

        {/* Table */}
        {renderTable()}
      </div>

      {/* Modal */}
      {showModal && activeTab !== "labels" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-heading/60">
          <div className="bg-surface-elevated rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-heading">
                {editing ? "Düzenle" : "Yeni Ekle"}
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-heading"
              >
                <XCircleIcon className="h-6 w-6" />
              </Button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {renderFormFields()}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setShowModal(false)}
                >
                  İptal
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
