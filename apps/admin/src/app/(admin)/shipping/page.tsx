'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { StatusBadge, Spinner } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
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
    XCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

type TabType = 'methods' | 'carriers' | 'zones' | 'rates' | 'labels';

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
    const [activeTab, setActiveTab] = useState<TabType>('methods');
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
        { key: 'methods', label: 'Yöntemler', icon: TruckIcon },
        { key: 'carriers', label: 'Firmalar', icon: BuildingOfficeIcon },
        { key: 'zones', label: 'Bölgeler', icon: GlobeAltIcon },
        { key: 'rates', label: 'Ücretler', icon: BanknotesIcon },
        { key: 'labels', label: 'Etiketler', icon: TagIcon },
    ];

    // Load data based on active tab
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            switch (activeTab) {
                case 'methods':
                    const methodsRes = await adminApi.getShippingMethods();
                    setMethods(methodsRes.data?.data || methodsRes.data || []);
                    break;
                case 'carriers':
                    const carriersRes = await adminApi.getShippingCarriers();
                    setCarriers(carriersRes.data?.data || carriersRes.data || []);
                    break;
                case 'zones':
                    const zonesRes = await adminApi.getShippingZones();
                    setZones(zonesRes.data?.data || zonesRes.data || []);
                    break;
                case 'rates':
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
                case 'labels':
                    const shipmentsRes = await adminApi.getShipments({ page: 1, limit: 50 });
                    setShipments(shipmentsRes.data?.data || shipmentsRes.data || []);
                    break;
            }
        } catch (error: any) {
            toast.error('Veriler yüklenemedi');
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
                case 'methods':
                    setFormData({ name: '', code: '', description: '', isActive: true });
                    break;
                case 'carriers':
                    setFormData({ name: '', code: '', logo: '', trackingUrl: '', apiKey: '', apiSecret: '', isActive: true });
                    break;
                case 'zones':
                    setFormData({ name: '', countries: [], isActive: true });
                    break;
                case 'rates':
                    setFormData({
                        zoneId: zones[0]?.id || '',
                        methodId: methods[0]?.id || '',
                        carrierId: carriers[0]?.id || '',
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
                case 'methods':
                    if (editing) {
                        await adminApi.updateShippingMethod(editing.id, formData);
                    } else {
                        await adminApi.createShippingMethod(formData);
                    }
                    break;
                case 'carriers':
                    if (editing) {
                        await adminApi.updateShippingCarrier(editing.id, formData);
                    } else {
                        await adminApi.createShippingCarrier(formData);
                    }
                    break;
                case 'zones':
                    if (editing) {
                        await adminApi.updateShippingZone(editing.id, formData);
                    } else {
                        await adminApi.createShippingZone(formData);
                    }
                    break;
                case 'rates':
                    if (editing) {
                        await adminApi.updateShippingRate(editing.id, formData);
                    } else {
                        await adminApi.createShippingRate(formData);
                    }
                    break;
            }
            toast.success(editing ? 'Güncellendi' : 'Oluşturuldu');
            setShowModal(false);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Hata oluştu');
        } finally {
            setSaving(false);
        }
    };

    // Delete handler
    const handleDelete = async (id: string) => {
        if (!confirm('Silmek istediğinizden emin misiniz?')) return;
        try {
            switch (activeTab) {
                case 'methods':
                    await adminApi.deleteShippingMethod(id);
                    break;
                case 'carriers':
                    await adminApi.deleteShippingCarrier(id);
                    break;
                case 'zones':
                    await adminApi.deleteShippingZone(id);
                    break;
                case 'rates':
                    await adminApi.deleteShippingRate(id);
                    break;
            }
            toast.success('Silindi');
            loadData();
        } catch (error: any) {
            toast.error('Silme başarısız');
        }
    };

    // Label generation
    const handleGenerateLabel = async (id: string) => {
        try {
            const res = await adminApi.generateShippingLabel(id);
            toast.success('Etiket oluşturuldu');
            loadData();
            if (res.data?.labelUrl) {
                window.open(res.data.labelUrl, '_blank');
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Etiket oluşturma hatası');
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
            toast.error('Toplu etiket oluşturma hatası');
        }
    };

    const shippingStatusConfig: Record<string, StatusConfig> = {
        pending: { label: 'Bekliyor', variant: 'warning' },
        label_generated: { label: 'Etiket Hazır', variant: 'info' },
        shipped: { label: 'Kargolandı', variant: 'success' },
        delivered: { label: 'Teslim Edildi', variant: 'success' },
    };

    // Render form fields based on active tab
    const renderFormFields = () => {
        switch (activeTab) {
            case 'methods':
                return (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Ad *</label>
                            <input
                                type="text"
                                value={formData.name || ''}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="admin-input"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Kod *</label>
                            <input
                                type="text"
                                value={formData.code || ''}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                className="admin-input"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Açıklama</label>
                            <textarea
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="admin-input"
                                rows={3}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600"
                            />
                            <label className="text-sm text-gray-600">Aktif</label>
                        </div>
                    </>
                );

            case 'carriers':
                return (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Ad *</label>
                                <input
                                    type="text"
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="admin-input"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Kod *</label>
                                <input
                                    type="text"
                                    value={formData.code || ''}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    className="admin-input"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Logo URL</label>
                            <input
                                type="text"
                                value={formData.logo || ''}
                                onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                                className="admin-input"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Takip URL</label>
                            <input
                                type="text"
                                value={formData.trackingUrl || ''}
                                onChange={(e) => setFormData({ ...formData, trackingUrl: e.target.value })}
                                className="admin-input"
                                placeholder="https://tracking.example.com/?no={trackingNumber}"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">API Key</label>
                                <input
                                    type="password"
                                    value={formData.apiKey || ''}
                                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                    className="admin-input"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">API Secret</label>
                                <input
                                    type="password"
                                    value={formData.apiSecret || ''}
                                    onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                                    className="admin-input"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600"
                            />
                            <label className="text-sm text-gray-600">Aktif</label>
                        </div>
                    </>
                );

            case 'zones':
                return (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Bölge Adı *</label>
                            <input
                                type="text"
                                value={formData.name || ''}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="admin-input"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Ülkeler (virgülle ayırın)</label>
                            <input
                                type="text"
                                value={Array.isArray(formData.countries) ? formData.countries.join(', ') : ''}
                                onChange={(e) => setFormData({ ...formData, countries: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                                className="admin-input"
                                placeholder="TR, DE, FR"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600"
                            />
                            <label className="text-sm text-gray-600">Aktif</label>
                        </div>
                    </>
                );

            case 'rates':
                return (
                    <>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Bölge *</label>
                                <select
                                    value={formData.zoneId || ''}
                                    onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
                                    className="admin-input"
                                    required
                                >
                                    <option value="">Seçin</option>
                                    {zones.map((z) => (
                                        <option key={z.id} value={z.id}>{z.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Yöntem *</label>
                                <select
                                    value={formData.methodId || ''}
                                    onChange={(e) => setFormData({ ...formData, methodId: e.target.value })}
                                    className="admin-input"
                                    required
                                >
                                    <option value="">Seçin</option>
                                    {methods.map((m) => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Firma *</label>
                                <select
                                    value={formData.carrierId || ''}
                                    onChange={(e) => setFormData({ ...formData, carrierId: e.target.value })}
                                    className="admin-input"
                                    required
                                >
                                    <option value="">Seçin</option>
                                    {carriers.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Baz Fiyat (₺) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.basePrice || 0}
                                    onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) })}
                                    className="admin-input"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">KG Başı (₺)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.pricePerKg || 0}
                                    onChange={(e) => setFormData({ ...formData, pricePerKg: parseFloat(e.target.value) })}
                                    className="admin-input"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Ücretsiz Kargo Limiti (₺)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.freeShippingMin || ''}
                                onChange={(e) => setFormData({ ...formData, freeShippingMin: e.target.value ? parseFloat(e.target.value) : undefined })}
                                className="admin-input"
                                placeholder="Boş bırakılabilir"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Min. Teslimat (Gün)</label>
                                <input
                                    type="number"
                                    value={formData.minDeliveryDays || 1}
                                    onChange={(e) => setFormData({ ...formData, minDeliveryDays: parseInt(e.target.value) })}
                                    className="admin-input"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Max. Teslimat (Gün)</label>
                                <input
                                    type="number"
                                    value={formData.maxDeliveryDays || 3}
                                    onChange={(e) => setFormData({ ...formData, maxDeliveryDays: parseInt(e.target.value) })}
                                    className="admin-input"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600"
                            />
                            <label className="text-sm text-gray-600">Aktif</label>
                        </div>
                    </>
                );

            default:
                return null;
        }
    };

    // Render table based on active tab
    const renderTable = () => {
        if (loading) {
            return (
                <div className="text-center py-12">
                    <Spinner size="lg" className="mx-auto" />
                </div>
            );
        }

        switch (activeTab) {
            case 'methods':
                return (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Ad</th>
                                <th>Kod</th>
                                <th>Açıklama</th>
                                <th>Durum</th>
                                <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {methods.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Kayıt bulunamadı</td></tr>
                            ) : (
                                methods.map((item) => (
                                    <tr key={item.id}>
                                        <td className="font-medium text-gray-900">{item.name}</td>
                                        <td><code className="text-primary-400">{item.code}</code></td>
                                        <td className="text-gray-500 max-w-xs truncate">{item.description || '-'}</td>
                                        <td>
                                            {item.isActive ? (
                                                <span className="badge badge-success">Aktif</span>
                                            ) : (
                                                <span className="badge badge-gray">Pasif</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button onClick={() => openModal(item)} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                                                    <PencilIcon className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                );

            case 'carriers':
                return (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Firma</th>
                                <th>Kod</th>
                                <th>Takip URL</th>
                                <th>Durum</th>
                                <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {carriers.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Kayıt bulunamadı</td></tr>
                            ) : (
                                carriers.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                {item.logo && <img src={item.logo} alt="" className="h-8 w-8 object-contain rounded" />}
                                                <span className="font-medium text-gray-900">{item.name}</span>
                                            </div>
                                        </td>
                                        <td><code className="text-primary-400">{item.code}</code></td>
                                        <td className="text-gray-500 max-w-xs truncate">{item.trackingUrl || '-'}</td>
                                        <td>
                                            {item.isActive ? (
                                                <span className="badge badge-success">Aktif</span>
                                            ) : (
                                                <span className="badge badge-gray">Pasif</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button onClick={() => openModal(item)} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                                                    <PencilIcon className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                );

            case 'zones':
                return (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Bölge Adı</th>
                                <th>Ülkeler</th>
                                <th>Durum</th>
                                <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {zones.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-8 text-gray-500">Kayıt bulunamadı</td></tr>
                            ) : (
                                zones.map((item) => (
                                    <tr key={item.id}>
                                        <td className="font-medium text-gray-900">{item.name}</td>
                                        <td className="text-gray-500">{item.countries?.join(', ') || '-'}</td>
                                        <td>
                                            {item.isActive ? (
                                                <span className="badge badge-success">Aktif</span>
                                            ) : (
                                                <span className="badge badge-gray">Pasif</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button onClick={() => openModal(item)} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                                                    <PencilIcon className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                );

            case 'rates':
                return (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Bölge</th>
                                <th>Yöntem</th>
                                <th>Firma</th>
                                <th>Fiyat</th>
                                <th>Teslimat</th>
                                <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rates.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-gray-500">Kayıt bulunamadı</td></tr>
                            ) : (
                                rates.map((item) => (
                                    <tr key={item.id}>
                                        <td className="font-medium text-gray-900">{item.zone?.name || '-'}</td>
                                        <td className="text-gray-500">{item.method?.name || '-'}</td>
                                        <td className="text-gray-500">{item.carrier?.name || '-'}</td>
                                        <td>
                                            <span className="text-primary-400 font-semibold">₺{item.basePrice?.toLocaleString()}</span>
                                            {item.pricePerKg > 0 && <span className="text-xs text-gray-500 ml-1">(+₺{item.pricePerKg}/kg)</span>}
                                        </td>
                                        <td className="text-gray-500">{item.minDeliveryDays}-{item.maxDeliveryDays} gün</td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button onClick={() => openModal(item)} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                                                    <PencilIcon className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                );

            case 'labels':
                return (
                    <>
                        {selectedIds.length > 0 && (
                            <div className="mb-4 flex items-center gap-4 p-4 bg-gray-100 rounded-lg">
                                <span className="text-gray-600">{selectedIds.length} gönderi seçildi</span>
                                <button onClick={handleBulkGenerateLabels} className="btn-primary">
                                    <PrinterIcon className="h-4 w-4 mr-2" />
                                    Toplu Etiket Oluştur
                                </button>
                            </div>
                        )}
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.length === shipments.length && shipments.length > 0}
                                            onChange={() => {
                                                if (selectedIds.length === shipments.length) {
                                                    setSelectedIds([]);
                                                } else {
                                                    setSelectedIds(shipments.map(s => s.id));
                                                }
                                            }}
                                            className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600"
                                        />
                                    </th>
                                    <th>Sipariş</th>
                                    <th>Alıcı</th>
                                    <th>Kargo</th>
                                    <th>Takip No</th>
                                    <th>Durum</th>
                                    <th>İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shipments.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-8 text-gray-500">Gönderi bulunamadı</td></tr>
                                ) : (
                                    shipments.map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(item.id)}
                                                    onChange={() => {
                                                        if (selectedIds.includes(item.id)) {
                                                            setSelectedIds(selectedIds.filter(id => id !== item.id));
                                                        } else {
                                                            setSelectedIds([...selectedIds, item.id]);
                                                        }
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600"
                                                />
                                            </td>
                                            <td className="font-medium text-primary-400">#{item.order?.orderNumber || '-'}</td>
                                            <td className="text-gray-900">{item.order?.buyer?.displayName || '-'}</td>
                                            <td className="text-gray-500">{item.carrier?.name || '-'}</td>
                                            <td><code className="text-xs text-gray-500">{item.trackingNumber || '-'}</code></td>
                                            <td><StatusBadge status={(item.status || '').toLowerCase()} config={shippingStatusConfig} /></td>
                                            <td>
                                                {item.labelUrl ? (
                                                    <a href={item.labelUrl} target="_blank" rel="noreferrer" className="p-2 text-blue-700 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg inline-flex">
                                                        <PrinterIcon className="h-4 w-4" />
                                                    </a>
                                                ) : (
                                                    <button onClick={() => handleGenerateLabel(item.id)} className="p-2 text-primary-400 hover:text-primary-300 hover:bg-primary-50 rounded-lg">
                                                        <TagIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
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
                        <h1 className="text-2xl font-bold text-gray-900">Kargo Yönetimi</h1>
                        <p className="text-gray-500 mt-1">Kargo yöntemleri, firmaları, bölgeleri ve ücretleri yönetin</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={loadData} className="btn-secondary">
                            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        {activeTab !== 'labels' && (
                            <button onClick={() => openModal()} className="btn-primary">
                                <PlusIcon className="h-4 w-4 mr-2" />
                                Yeni Ekle
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as TabType)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${activeTab === tab.key
                                    ? 'bg-primary-500 text-gray-900'
                                    : 'bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                        >
                            <tab.icon className="h-5 w-5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <div className="admin-card overflow-hidden">
                    <div className="overflow-x-auto">
                        {renderTable()}
                    </div>
                </div>
            </div>

            {/* Modal */}
            {showModal && activeTab !== 'labels' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {editing ? 'Düzenle' : 'Yeni Ekle'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-900">
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-4 space-y-4">
                            {renderFormFields()}
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                                    İptal
                                </button>
                                <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
