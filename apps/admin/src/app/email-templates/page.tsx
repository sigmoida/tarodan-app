'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
  PencilIcon,
  EyeIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface TemplateListItem {
  key: string;
  name: string;
  subject: string | null;
  hasCustomBody: boolean;
  variablesJson: string | null;
  updatedAt: string | null;
}

interface TemplateDetail {
  key: string;
  name: string;
  subject: string | null;
  bodyHtml: string | null;
  variablesJson: string | null;
  isCustom: boolean;
}

const SAMPLE_DATA: Record<string, Record<string, unknown>> = {
  welcome: { name: 'Örnek Kullanıcı', verifyUrl: 'https://example.com/verify' },
  'order-confirmation': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', totalAmount: 199.99 },
  'order-created-buyer': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', productTitle: 'Örnek Ürün', totalAmount: 199.99 },
  'order-created-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', productTitle: 'Örnek Ürün', totalAmount: 199.99 },
  'order-paid': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', productTitle: 'Örnek Ürün', totalAmount: 199.99 },
  'order-paid-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', productTitle: 'Örnek Ürün', totalAmount: 199.99 },
  'order-shipped': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', trackingNumber: '1234567890', provider: 'Aras' },
  'order-delivered': { buyerName: 'Alıcı', orderNumber: 'TRD-12345' },
  'password-reset': { name: 'Kullanıcı', resetUrl: 'https://example.com/reset' },
  'offer-received': { sellerName: 'Satıcı', productTitle: 'Ürün', offerAmount: 150, buyerName: 'Alıcı' },
  'offer-accepted': { buyerName: 'Alıcı', productTitle: 'Ürün', offerAmount: 150, orderNumber: 'TRD-12345' },
  'wishlist-price-change': { userName: 'Kullanıcı', productTitle: 'Ürün', oldPrice: 200, newPrice: 180 },
  'marketing-newsletter': { userName: 'Kullanıcı' },
  'marketing-monthly': { userName: 'Kullanıcı' },
};

export default function AdminEmailTemplatesPage() {
  const [list, setList] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', bodyHtml: '' });
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getEmailTemplates();
      setList(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Şablonlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = async (key: string) => {
    setSelectedKey(key);
    try {
      const res = await adminApi.getEmailTemplate(key);
      const d = res.data;
      setDetail(d);
      setForm({
        name: d.name || key,
        subject: d.subject || '',
        bodyHtml: d.bodyHtml || '',
      });
      setPreview(null);
      setTestEmail('');
      setShowModal(true);
    } catch (e) {
      toast.error('Şablon yüklenemedi');
    }
  };

  const handleSave = async () => {
    if (!selectedKey) return;
    try {
      await adminApi.updateEmailTemplate(selectedKey, form);
      toast.success('Şablon kaydedildi');
      loadList();
      const res = await adminApi.getEmailTemplate(selectedKey);
      setDetail(res.data);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Kaydetme başarısız');
    }
  };

  const handlePreview = async () => {
    if (!selectedKey) return;
    try {
      const sample = SAMPLE_DATA[selectedKey] || {};
      const res = await adminApi.previewEmailTemplate(selectedKey, sample);
      setPreview(res.data);
    } catch (e) {
      toast.error('Önizleme alınamadı');
    }
  };

  const handleSendTest = async () => {
    if (!selectedKey || !testEmail.trim()) {
      toast.error('E-posta adresi girin');
      return;
    }
    setSendingTest(true);
    try {
      const sample = SAMPLE_DATA[selectedKey] || {};
      await adminApi.sendTestEmail(selectedKey, { to: testEmail.trim(), templateData: sample });
      toast.success('Test e-postası kuyruğa eklendi');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gönderilemedi');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">E-posta Şablonları</h1>
        <p className="text-gray-400 text-sm">
          Şablonları düzenleyebilir, önizleyebilir ve test e-postası gönderebilirsiniz. Değişkenler için <code className="bg-dark-700 px-1 rounded">{'{{değişkenAdı}}'}</code> kullanın.
        </p>

        <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Şablon bulunamadı</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-dark-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Anahtar</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Ad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Konu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Özel</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {list.map((t) => (
                    <tr key={t.key} className="text-gray-300">
                      <td className="px-4 py-3 text-sm font-mono">{t.key}</td>
                      <td className="px-4 py-3 text-sm">{t.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{t.subject || '(varsayılan)'}</td>
                      <td className="px-4 py-3">
                        {t.hasCustomBody ? (
                          <span className="text-green-500">Özel</span>
                        ) : (
                          <span className="text-gray-500">Varsayılan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(t.key)}
                          className="inline-flex items-center gap-1 text-primary-500 hover:text-primary-400 text-sm"
                        >
                          <PencilIcon className="h-4 w-4" />
                          Düzenle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showModal && selectedKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <h2 className="text-lg font-semibold text-white">Şablon: {selectedKey}</h2>
                <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {selectedKey && (() => {
                  const vars = detail?.variablesJson
                    ? (() => {
                        try {
                          const o = JSON.parse(detail.variablesJson);
                          return typeof o === 'object' && o !== null ? Object.keys(o) : [];
                        } catch {
                          return [];
                        }
                      })()
                    : Object.keys(SAMPLE_DATA[selectedKey] || {});
                  return vars.length > 0 ? (
                    <div className="rounded-lg bg-dark-700/50 border border-dark-600 p-3">
                      <p className="text-sm font-medium text-gray-400 mb-2">Bu şablonda kullanılabilir değişkenler</p>
                      <p className="text-xs text-gray-500 font-mono flex flex-wrap gap-x-2 gap-y-1">
                        {vars.map((v) => (
                          <span key={v} className="text-primary-400">{'{{' + v + '}}'}</span>
                        ))}
                      </p>
                    </div>
                  ) : null;
                })()}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Görünen ad</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Konu</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                    placeholder="E-posta konusu. {{orderNumber}} gibi değişkenler kullanılabilir."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">HTML gövde</label>
                  <textarea
                    value={form.bodyHtml}
                    onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
                    rows={14}
                    className="input-dark w-full rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="HTML içerik. {{name}}, {{orderNumber}} vb. değişkenler kullanılabilir."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600"
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-700 text-white hover:bg-dark-600"
                  >
                    <EyeIcon className="h-4 w-4" />
                    Önizleme
                  </button>
                  <div className="flex items-center gap-2 ml-4">
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="input-dark rounded-lg px-3 py-2 text-sm w-48"
                    />
                    <button
                      type="button"
                      onClick={handleSendTest}
                      disabled={sendingTest}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-700 text-white hover:bg-dark-600 disabled:opacity-50"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {sendingTest ? 'Gönderiliyor...' : 'Test gönder'}
                    </button>
                  </div>
                </div>
                {preview && (
                  <div className="border border-dark-600 rounded-lg p-4 mt-4">
                    <p className="text-sm font-medium text-gray-400 mb-2">Önizleme</p>
                    <p className="text-sm text-gray-300 mb-2">Konu: {preview.subject}</p>
                    <div
                      className="bg-white text-gray-900 rounded p-4 text-sm prose prose-sm max-w-none overflow-auto max-h-96"
                      dangerouslySetInnerHTML={{ __html: preview.html }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
