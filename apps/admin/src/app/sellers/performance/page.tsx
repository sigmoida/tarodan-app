'use client';

import { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
    CurrencyDollarIcon,
    ShoppingBagIcon,
    StarIcon,
    ArrowTrendingUpIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

// Mock performance data
const SELLER_STATS = {
    totalActiveSellers: 142,
    totalRevenue: 2543000,
    avgSellerRating: 4.6,
    topSellerName: 'Teknoloji Dünyası',
};

const TOP_SELLERS = [
    { id: '1', name: 'Teknoloji Dünyası', sales: 1250, revenue: 850000, rating: 4.8, status: 'active' },
    { id: '2', name: 'Moda Butik', sales: 980, revenue: 420000, rating: 4.5, status: 'active' },
    { id: '3', name: 'Kitap Kurdu', sales: 540, revenue: 120000, rating: 4.9, status: 'active' },
    { id: '4', name: 'Ev Dekor', sales: 320, revenue: 280000, rating: 4.2, status: 'warning' },
    { id: '5', name: 'Spor Mağazası', sales: 210, revenue: 150000, rating: 4.6, status: 'active' },
];

export default function SellerPerformancePage() {
    const [period, setPeriod] = useState('month');

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Satıcı Performansı</h1>
                        <p className="text-gray-500 mt-1">Satıcı satış ve performans metrikleri</p>
                    </div>
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="admin-input"
                    >
                        <option value="week">Bu Hafta</option>
                        <option value="month">Bu Ay</option>
                        <option value="year">Bu Yıl</option>
                    </select>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="admin-card p-4 flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-lg">
                            <UsersIcon className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Aktif Satıcı</p>
                            <h3 className="text-xl font-bold text-gray-900">{SELLER_STATS.totalActiveSellers}</h3>
                        </div>
                    </div>
                    <div className="admin-card p-4 flex items-center gap-4">
                        <div className="p-3 bg-green-500/10 rounded-lg">
                            <CurrencyDollarIcon className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Toplam Ciro</p>
                            <h3 className="text-xl font-bold text-gray-900">
                                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(SELLER_STATS.totalRevenue)}
                            </h3>
                        </div>
                    </div>
                    <div className="admin-card p-4 flex items-center gap-4">
                        <div className="p-3 bg-yellow-500/10 rounded-lg">
                            <StarIcon className="w-6 h-6 text-yellow-500" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Ort. Puan</p>
                            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-1">
                                {SELLER_STATS.avgSellerRating} <StarIconSolid className="w-4 h-4 text-yellow-500" />
                            </h3>
                        </div>
                    </div>
                    <div className="admin-card p-4 flex items-center gap-4">
                        <div className="p-3 bg-purple-500/10 rounded-lg">
                            <ArrowTrendingUpIcon className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">En İyi Satıcı</p>
                            <h3 className="text-sm font-bold text-gray-900 truncate max-w-[120px]" title={SELLER_STATS.topSellerName}>
                                {SELLER_STATS.topSellerName}
                            </h3>
                        </div>
                    </div>
                </div>

                {/* Top Sellers Table */}
                <div className="admin-card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">En Çok Satanlar</h3>
                    <div className="overflow-x-auto">
                        <table className="admin-table w-full">
                            <thead>
                                <tr>
                                    <th className="text-left p-4">Satıcı Adı</th>
                                    <th className="text-left p-4">Toplam Satış</th>
                                    <th className="text-left p-4">Ciro</th>
                                    <th className="text-left p-4">Puan</th>
                                    <th className="text-left p-4">Durum</th>
                                    <th className="text-right p-4">Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {TOP_SELLERS.map((seller, idx) => (
                                    <tr key={seller.id} className="border-b border-gray-200 hover:bg-gray-100/50">
                                        <td className="p-4 font-medium text-gray-900 flex items-center gap-3">
                                            <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                                                {idx + 1}
                                            </span>
                                            {seller.name}
                                        </td>
                                        <td className="p-4 text-gray-600 flex items-center gap-2">
                                            <ShoppingBagIcon className="w-4 h-4 text-gray-500" />
                                            {seller.sales}
                                        </td>
                                        <td className="p-4 font-medium text-green-700">
                                            {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(seller.revenue)}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1 text-yellow-500">
                                                <span className="font-bold text-gray-900">{seller.rating}</span>
                                                <StarIconSolid className="w-4 h-4" />
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${seller.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                                                }`}>
                                                {seller.status === 'active' ? 'Çok İyi' : 'Dikkat'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <ArrowTrendingUpIcon className="w-5 h-5 text-green-500 inline-block" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Charts Mockup */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="admin-card">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Satıcı Büyümesi</h3>
                        <div className="h-64 flex items-end justify-between gap-2 px-4 pb-2 border-b border-l border-gray-300">
                            {[40, 65, 55, 80, 70, 90, 85, 95, 100, 110, 105, 120].map((h, i) => (
                                <div key={i} className="w-full bg-primary-600/50 hover:bg-primary-600 rounded-t transition-all relative group" style={{ height: `${h}%` }}>
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-gray-900 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
                                        {h} Yeni Satıcı
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-2 px-4">
                            <span>Oca</span><span>Ara</span>
                        </div>
                    </div>

                    <div className="admin-card">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Kategori Dağılımı</h3>
                        <div className="space-y-4">
                            {[
                                { label: 'Elektronik', val: 75, color: 'bg-blue-500' },
                                { label: 'Giyim', val: 60, color: 'bg-purple-500' },
                                { label: 'Ev & Yaşam', val: 45, color: 'bg-green-500' },
                                { label: 'Kozmetik', val: 30, color: 'bg-pink-500' },
                            ].map((cat) => (
                                <div key={cat.label}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">{cat.label}</span>
                                        <span className="text-gray-500">{cat.val}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full ${cat.color}`} style={{ width: `${cat.val}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
