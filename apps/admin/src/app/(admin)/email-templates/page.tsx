'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Input, Textarea } from '@tarodan/ui';
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
  'order-shipped': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', trackingNumber: '1234567890', provider: 'Sürat Kargo' },
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
    <>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-heading">E-posta Şablonları</h1>
        <p className="text-muted text-sm">
          Şablonları düzenleyebilir, önizleyebilir ve test e-postası gönderebilirsiniz. Değişkenler için <code className="bg-surface-alt px-1 rounded">{'{{değişkenAdı}}'}</code> kullanın.
        </p>

        <div className="bg-surface-elevated rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted">Yükleniyor...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-muted">Şablon bulunamadı</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Anahtar</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Ad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Konu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Özel</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map((t) => (
                    <tr key={t.key} className="text-muted">
                      <td className="px-4 py-3 text-sm font-mono">{t.key}</td>
                      <td className="px-4 py-3 text-sm">{t.name}</td>
                      <td className="px-4 py-3 text-sm text-muted max-w-xs truncate">{t.subject || '(varsayılan)'}</td>
                      <td className="px-4 py-3">
                        {t.hasCustomBody ? (
                          <span className="text-success-500">Özel</span>
                        ) : (
                          <span className="text-muted">Varsayılan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" type="button"
                          onClick={() => openEdit(t.key)}
                          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-400 text-sm">
                          <PencilIcon className="h-4 w-4" />
                          Düzenle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showModal && selectedKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-heading/60">
            <div className="bg-surface-elevated rounded-xl border border-border w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-3 border-b border-border">
                <h2 className="text-lg font-semibold text-heading leading-tight truncate min-w-0">Şablon: {selectedKey}</h2>
                <Button variant="secondary" type="button" onClick={() => setShowModal(false)} className="text-muted hover:text-heading shrink-0">
                  <XMarkIcon className="h-6 w-6" />
                </Button>
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
                    <div className="bg-surface-alt/50 p-3">
                      <p className="text-sm font-medium text-muted mb-2">Bu şablonda kullanılabilir değişkenler</p>
                      <p className="text-xs text-muted font-mono flex flex-wrap gap-x-2 gap-y-1">
                        {vars.map((v) => (
                          <span key={v} className="text-primary-400">{'{{' + v + '}}'}</span>
                        ))}
                      </p>
                    </div>
                  ) : null;
                })()}
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Görünen ad</label>
                  <Input type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Konu</label>
                  <Input type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="E-posta konusu. {{orderNumber}} gibi değişkenler kullanılabilir." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">HTML gövde</label>
                  <Textarea value={form.bodyHtml}
                    onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
                    rows={14}
                    className="font-mono"
                    placeholder="HTML içerik. {{name}}, {{orderNumber}} vb. değişkenler kullanılabilir." />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" type="button"
                    onClick={handleSave}
                    className="px-4 py-2 rounded-lg bg-primary-500 text-heading hover:bg-primary-600">
                    Kaydet
                  </Button>
                  <Button variant="secondary" type="button"
                    onClick={handlePreview}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-alt text-heading hover:bg-surface-alt">
                    <EyeIcon className="h-4 w-4" />
                    Önizleme
                  </Button>
                  <div className="flex items-center gap-2 ml-4">
                    <Input type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="w-48" />
                    <Button variant="secondary" type="button"
                      onClick={handleSendTest}
                      disabled={sendingTest}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-alt text-heading hover:bg-surface-alt disabled:opacity-50">
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {sendingTest ? 'Gönderiliyor...' : 'Test gönder'}
                    </Button>
                  </div>
                </div>
                {preview && (
                  <div className="p-4 mt-4">
                    <p className="text-sm font-medium text-muted mb-2">Önizleme</p>
                    <p className="text-sm text-muted mb-2">Konu: {preview.subject}</p>
                    <div
                      className="bg-surface-elevated text-heading rounded p-4 text-sm prose prose-sm max-w-none overflow-auto max-h-96"
                      dangerouslySetInnerHTML={{ __html: preview.html }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
