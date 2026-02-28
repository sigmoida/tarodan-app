'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
    CreditCardIcon,
    KeyIcon,
    GlobeAltIcon,
    CheckCircleIcon,
    XCircleIcon
} from '@heroicons/react/24/outline';

interface PaymentGateway {
    id: string;
    name: string;
    enabled: boolean;
    mode: 'test' | 'live';
    config: Record<string, string>;
}

const DEFAULT_GATEWAYS: PaymentGateway[] = [
    {
        id: 'iyzico',
        name: 'Iyzico',
        enabled: true,
        mode: 'test',
        config: {
            apiKey: '',
            secretKey: '',
            baseUrl: 'https://sandbox-api.iyzipay.com'
        }
    },
    {
        id: 'stripe',
        name: 'Stripe',
        enabled: false,
        mode: 'test',
        config: {
            publishableKey: '',
            secretKey: '',
        }
    }
];

export default function PaymentSettingsPage() {
    const [gateways, setGateways] = useState<PaymentGateway[]>(DEFAULT_GATEWAYS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await adminApi.getSettings();
            const settingsData = response.data?.data || response.data || [];

            let gatewaysSetting: any = null;

            if (Array.isArray(settingsData)) {
                const item = settingsData.find((s: any) => s.settingKey === 'payment_gateways' || s.key === 'payment_gateways');
                if (item) gatewaysSetting = item.settingValue || item.value;
            } else {
                gatewaysSetting = settingsData.payment_gateways;
            }

            if (gatewaysSetting) {
                try {
                    // Need to parse if it's a string, or use if it's already an object (though backend usually returns string for value)
                    const parsed = typeof gatewaysSetting === 'string' ? JSON.parse(gatewaysSetting) : gatewaysSetting;
                    // Merge with defaults to ensure structure
                    const merged = DEFAULT_GATEWAYS.map(def => {
                        const found = parsed.find((p: any) => p.id === def.id);
                        return found ? { ...def, ...found } : def;
                    });
                    setGateways(merged);
                } catch (e) {
                    console.error('Failed to parse payment gateways setting', e);
                }
            }
        } catch (error) {
            console.error('Failed to load payment settings:', error);
            // Don't block UI, just use defaults
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await adminApi.updateSetting('payment_gateways', JSON.stringify(gateways));
            toast.success('Ödeme ayarları başarıyla kaydedildi');
        } catch (error) {
            console.error('Failed to save payment settings:', error);
            toast.error('Ayarlar kaydedilirken bir hata oluştu');
        } finally {
            setSaving(false);
        }
    };

    const updateGateway = (id: string, updates: Partial<PaymentGateway>) => {
        setGateways(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    };

    const updateConfig = (id: string, key: string, value: string) => {
        setGateways(prev => prev.map(g => {
            if (g.id !== id) return g;
            return {
                ...g,
                config: {
                    ...g.config,
                    [key]: value
                }
            };
        }));
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Ödeme Ayarları</h1>
                        <p className="text-gray-500 mt-1">Ödeme geçitlerini ve API anahtarlarını yapılandırın</p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary px-6 flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Kaydediliyor...
                            </>
                        ) : (
                            <>
                                <CheckCircleIcon className="w-5 h-5" />
                                Kaydet
                            </>
                        )}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {gateways.map(gateway => (
                        <div key={gateway.id} className={`admin-card border-2 transition-colors ${gateway.enabled ? 'border-primary-500/30' : 'border-gray-200'}`}>
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-lg ${gateway.enabled ? 'bg-primary-100 text-primary-400' : 'bg-gray-100 text-gray-500'}`}>
                                        <CreditCardIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">{gateway.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`w-2 h-2 rounded-full ${gateway.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                                            <span className="text-xs text-gray-500">{gateway.enabled ? 'Aktif' : 'Pasif'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={gateway.enabled}
                                            onChange={(e) => updateGateway(gateway.id, { enabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Mode Selection */}
                                <div className="bg-gray-100/50 p-4 rounded-lg">
                                    <label className="text-sm font-medium text-gray-500 block mb-2">Çalışma Modu</label>
                                    <div className="flex bg-white rounded-lg p-1">
                                        <button
                                            onClick={() => updateGateway(gateway.id, { mode: 'test' })}
                                            className={`flex-1 py-1.5 px-3 rounded text-sm font-medium transition-colors ${gateway.mode === 'test' ? 'bg-gray-100 text-gray-900 shadow' : 'text-gray-500 hover:text-gray-600'}`}
                                        >
                                            Test (Sandbox)
                                        </button>
                                        <button
                                            onClick={() => updateGateway(gateway.id, { mode: 'live' })}
                                            className={`flex-1 py-1.5 px-3 rounded text-sm font-medium transition-colors ${gateway.mode === 'live' ? 'bg-red-50 text-red-200 shadow' : 'text-gray-500 hover:text-gray-600'}`}
                                        >
                                            Canlı (Live)
                                        </button>
                                    </div>
                                </div>

                                {/* Config Fields */}
                                {Object.keys(gateway.config).map(key => (
                                    <div key={key}>
                                        <label className="block text-sm font-medium text-gray-500 mb-1 capitalize">
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={key.toLowerCase().includes('secret') ? 'password' : 'text'}
                                                value={gateway.config[key]}
                                                onChange={(e) => updateConfig(gateway.id, key, e.target.value)}
                                                className="admin-input pl-10 w-full"
                                                placeholder={`${gateway.name} ${key}...`}
                                            />
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                                                {key.toLowerCase().includes('key') ? <KeyIcon className="w-4 h-4" /> : <GlobeAltIcon className="w-4 h-4" />}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </AdminLayout>
    );
}
