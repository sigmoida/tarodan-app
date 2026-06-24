'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Input } from '@tarodan/ui';
import {
  PencilIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  CheckIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

interface TemplateListItem {
  key: string;
  name: string;
  group: string;
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

// Converts sample data to source data with {{variable}} placeholders for the editor
function makeSourceData(sample: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sample)) {
    if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (item !== null && typeof item === 'object') {
          const o: Record<string, unknown> = {};
          for (const k of Object.keys(item as object)) {
            const v = (item as Record<string, unknown>)[k];
            o[k] = typeof v === 'number' ? v : `{{${k}}}`;
          }
          return o;
        }
        return `{{${key}}}`;
      });
    } else if (typeof value === 'number') {
      result[key] = value; // keep numbers so formatEmailPrice doesn't break
    } else {
      result[key] = `{{${key}}}`;
    }
  }
  return result;
}

const SAMPLE_DATA: Record<string, Record<string, unknown>> = {
  // Hesap
  welcome:                    { name: 'Örnek Kullanıcı', verifyUrl: 'https://tarodan.com/verify?token=sample' },
  'email-verification':       { name: 'Örnek Kullanıcı', verificationUrl: 'https://tarodan.com/verify?token=sample', expiresIn: '24 saat' },
  'password-reset':           { name: 'Örnek Kullanıcı', resetUrl: 'https://tarodan.com/reset?token=sample' },
  // Sipariş
  'order-confirmation':       { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', totalAmount: 199.99 },
  'order-created-buyer':      { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99 },
  'order-created-seller':     { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99 },
  'order-paid':               { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99, transactionId: 'TXN-999', paymentMethod: 'Kredi Kartı' },
  'order-paid-seller':        { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99, commissionAmount: 20, netAmount: 179.99 },
  'order-shipped':            { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', trackingNumber: '1234567890', provider: 'Sürat Kargo' },
  'order-delivered':          { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id' },
  // Ödeme
  'payment-received':         { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', amount: 199.99 },
  'payment-failed':           { buyerName: 'Alıcı', orderNumber: 'TRD-12345', amount: 199.99, failureReason: 'Kart limiti yetersiz' },
  'payment-refunded':         { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', refundAmount: 199.99 },
  'payment-refunded-seller':  { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', refundAmount: 179.99 },
  // Teklif
  'offer-received':           { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', offerAmount: 150, buyerName: 'Alıcı', productPrice: 200 },
  'offer-accepted':           { buyerName: 'Alıcı', productTitle: 'Hot Wheels Ferrari 458', offerAmount: 150, orderNumber: 'TRD-12345', sellerName: 'Satıcı', orderId: 'sample-id' },
  // Ürün
  'product-approved':         { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', productUrl: 'https://tarodan.com/products/sample' },
  'wishlist-price-change':    { userName: 'Kullanıcı', productTitle: 'Hot Wheels Ferrari 458', oldPrice: 200, newPrice: 180, isPriceDrop: true, productUrl: 'https://tarodan.com/products/sample' },
  // Üyelik
  'premium-offer':            { userName: 'Kullanıcı', benefits: ['Sınırsız ilan', 'Öne çıkarma kredisi', 'Özel rozet'], ctaText: 'Premium Üye Ol' },
  'membership-expiring':      { userName: 'Kullanıcı', tierName: 'Premium', daysRemaining: 7, expirationDate: '2024-12-31' },
  'membership-expiring-urgent': { userName: 'Kullanıcı', tierName: 'Premium', expirationDate: '2024-12-24' },
  // Pazarlama
  'marketing-newsletter':     { userName: 'Kullanıcı', trendingProducts: [{ title: 'Hot Wheels Ferrari 458', price: 199, productUrl: 'https://tarodan.com/products/1' }] },
  'marketing-monthly':        { userName: 'Kullanıcı', featuredProducts: [{ title: 'Matchbox BMW M3', price: 149, productUrl: 'https://tarodan.com/products/2' }] },
  // İş Başvurusu
  'seller-application-approved': { name: 'Ahmet Yılmaz', companyName: 'Örnek Ticaret A.Ş.' },
  'seller-application-rejected':  { name: 'Ahmet Yılmaz', reason: 'Sağlanan belgeler eksik veya okunamaz durumda. Lütfen şirket kaşesi ve imzalı güncel vergi levhanızı yükleyerek tekrar başvurun.' },
  // Sipariş iptali
  'order-cancelled-buyer':    { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', refundAmount: 199.99, reason: 'Satıcı ürünü stoktan kaldırdı' },
  'order-cancelled-seller':   { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', reason: 'Alıcı talebi' },
  // İade akışı
  'refund-requested-seller':  { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', buyerName: 'Alıcı', refundAmount: 199.99, refundReason: 'Ürün açıklamayla uyuşmuyor' },
  'refund-approved-buyer':    { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', refundAmount: 199.99 },
  'refund-rejected-buyer':    { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', reason: 'Ürün kullanılmış olarak iade edilmek isteniyor' },
  'refund-return-label-buyer': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', returnTrackingNumber: '9876543210', cargoCompany: 'Sürat Kargo', returnUrl: 'https://tarodan.com/orders/sample-id/return' },
  // Değerlendirme
  'review-received-seller':   { sellerName: 'Satıcı', reviewerName: 'Alıcı', rating: 5, productTitle: 'Hot Wheels Ferrari 458', comment: 'Hızlı kargo, ürün birebir açıklandığı gibi. Teşekkürler!', reviewUrl: 'https://tarodan.com/seller/reviews' },
  // İlan & Stok
  'listing-expiring':         { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', daysRemaining: 3, expirationDate: '2024-12-31', listingUrl: 'https://tarodan.com/seller/listings' },
  'listing-expired':          { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', listingUrl: 'https://tarodan.com/seller/listings' },
  'back-in-stock':            { userName: 'Kullanıcı', productTitle: 'Hot Wheels Ferrari 458', price: 199.99, productUrl: 'https://tarodan.com/products/sample' },
  // Sosyal
  'new-follower':             { name: 'Kullanıcı', followerName: 'Ayşe D.', followerUrl: 'https://tarodan.com/profile/followers' },
  // Ödeme aktarımı
  'payout-released-seller':   { sellerName: 'Satıcı', orderNumber: 'TRD-12345', payoutAmount: 179.99, bankAccountLast4: '4242', payoutDate: '2024-12-20' },
};

export default function AdminEmailTemplatesPage() {
  const [list, setList] = useState<TemplateListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [editKey, setEditKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', bodyHtml: '' });
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [resetting, setResetting] = useState(false);
  const confirm = useConfirm();

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getEmailTemplates();
      setList(res.data?.data || []);
    } catch {
      toast.error('Şablonlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = useCallback(async (key: string, draftHtml?: string, draftSubject?: string) => {
    setPreviewLoading(true);
    setPreviewError(false);
    try {
      const sample = SAMPLE_DATA[key] || {};
      const res = await adminApi.previewEmailTemplate(
        key,
        sample as Record<string, any>,
        { html: draftHtml, subject: draftSubject },
      );
      setPreview(res.data);
    } catch {
      setPreviewError(true);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const openEdit = async (key: string) => {
    setEditKey(key);
    setPreview(null);
    setPreviewError(false);
    setTestEmail('');
    try {
      const res = await adminApi.getEmailTemplate(key);
      const d: TemplateDetail = res.data;
      setDetail(d);

      if (d.bodyHtml) {
        // Custom template: show saved HTML (has {{variables}}) in editor, render for preview
        setForm({ name: d.name || key, subject: d.subject || '', bodyHtml: d.bodyHtml });
        loadPreview(key, d.bodyHtml, d.subject || undefined);
      } else {
        // Default template: fetch source HTML ({{variables}}) for editor, render for preview
        const sample = SAMPLE_DATA[key] || {};
        const sourceData = makeSourceData(sample);
        const [sourceRes] = await Promise.all([
          adminApi.previewEmailTemplate(key, sourceData as Record<string, any>),
        ]);
        const editorHtml: string = sourceRes.data?.html || '';
        setForm({ name: d.name || key, subject: d.subject || '', bodyHtml: editorHtml });
        // Preview shows rendered (sample data) version
        loadPreview(key, undefined, undefined);
      }
    } catch {
      toast.error('Şablon yüklenemedi');
      setEditKey(null);
    }
  };

  const closeEdit = () => {
    setEditKey(null);
    setDetail(null);
    setPreview(null);
    clearTimeout(debounceRef.current);
  };

  const handleBodyChange = (value: string) => {
    setForm((f) => ({ ...f, bodyHtml: value }));
    if (editKey) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadPreview(editKey, value || undefined, form.subject || undefined);
      }, 1200);
    }
  };

  const handleSubjectChange = (value: string) => {
    setForm((f) => ({ ...f, subject: value }));
    if (editKey) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadPreview(editKey, form.bodyHtml || undefined, value || undefined);
      }, 1200);
    }
  };

  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
    handleBodyChange(newVal);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2;
    });
  };

  const handleSave = async () => {
    if (!editKey) return;
    setSaving(true);
    try {
      await adminApi.updateEmailTemplate(editKey, form);
      toast.success('Şablon kaydedildi');
      loadList();
      loadPreview(editKey, form.bodyHtml || undefined, form.subject || undefined);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Kaydetme başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!editKey) return;
    if (!testEmail.trim()) {
      toast.error('E-posta adresi girin');
      return;
    }
    setSendingTest(true);
    try {
      const sample = SAMPLE_DATA[editKey] || {};
      await adminApi.sendTestEmail(editKey, { to: testEmail.trim(), templateData: sample as Record<string, any> });
      toast.success('Test e-postası kuyruğa eklendi');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gönderilemedi');
    } finally {
      setSendingTest(false);
    }
  };

  const handleReset = async () => {
    if (!editKey) return;
    const ok = await confirm({
      title: 'Varsayılana sıfırla',
      description: 'Özel şablon silinecek ve varsayılan sistem şablonuna dönülecek. Emin misiniz?',
      confirmLabel: 'Sıfırla',
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    try {
      await adminApi.resetEmailTemplate(editKey);
      setDetail((d) => d ? { ...d, bodyHtml: null, subject: null, isCustom: false } : d);
      loadList();
      // Editor: source HTML with {{variables}}, Preview: rendered with sample data
      const sample = SAMPLE_DATA[editKey] || {};
      const sourceData = makeSourceData(sample);
      const sourceRes = await adminApi.previewEmailTemplate(editKey, sourceData as Record<string, any>);
      const editorHtml: string = sourceRes.data?.html || '';
      setForm((f) => ({ ...f, bodyHtml: editorHtml, subject: '' }));
      // Preview panel shows rendered version
      loadPreview(editKey, undefined, undefined);
      toast.success('Varsayılan şablona sıfırlandı');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Sıfırlama başarısız');
    } finally {
      setResetting(false);
    }
  };

  const getVariables = (): string[] => {
    if (detail?.variablesJson) {
      try {
        const o = JSON.parse(detail.variablesJson);
        if (typeof o === 'object' && o !== null) return Object.keys(o);
      } catch { /* empty */ }
    }
    return Object.keys(SAMPLE_DATA[editKey || ''] || {});
  };

  return (
    <>
      {/* ─── List Page ─── */}
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">E-posta Şablonları</h1>
          <p className="mt-1 text-sm text-muted">
            Sistem e-postalarını özelleştirin. Değişkenler için{' '}
            <code className="bg-surface-alt px-1 rounded text-xs font-mono">{'{{değişkenAdı}}'}</code>{' '}
            kullanın.
          </p>
        </div>

        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Şablon ara (anahtar, ad, grup, konu)..."
          className="w-full sm:w-80"
        />

        {loading ? (
          <div className="bg-surface-elevated rounded-xl border border-border p-8 text-center text-muted">
            <ArrowPathIcon className="h-5 w-5 animate-spin mx-auto mb-2" />
            Yükleniyor...
          </div>
        ) : list.length === 0 ? (
          <div className="bg-surface-elevated rounded-xl border border-border p-8 text-center text-muted">
            Şablon bulunamadı
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              // Anahtar / ad / grup / konu üzerinde istemci-taraflı arama.
              const q = search.trim().toLocaleLowerCase('tr');
              const visible = q
                ? list.filter((t) =>
                    [t.key, t.name, t.group, t.subject ?? '']
                      .some((f) => f.toLocaleLowerCase('tr').includes(q)),
                  )
                : list;
              if (visible.length === 0) {
                return (
                  <div className="bg-surface-elevated rounded-xl border border-border p-8 text-center text-muted">
                    Aramayla eşleşen şablon yok
                  </div>
                );
              }
              const groups = Array.from(new Set(visible.map((t) => t.group)));
              return groups.map((group) => {
                const items = visible.filter((t) => t.group === group);
                return (
                  <div key={group} className="bg-surface-elevated rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-surface-alt/40">
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">{group}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border">
                        <thead>
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Anahtar</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Ad</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase hidden sm:table-cell">Konu</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Durum</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {items.map((t) => (
                            <tr key={t.key} className="hover:bg-surface-alt/30 transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="text-xs font-mono text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded">
                                  {t.key}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-sm font-medium text-heading">{t.name}</td>
                              <td className="px-4 py-2.5 text-sm text-muted max-w-xs truncate hidden sm:table-cell">
                                {t.subject || <span className="italic text-muted/50">Varsayılan</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                {t.hasCustomBody ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success-600 bg-success-500/10 px-2 py-0.5 rounded-full">
                                    <CheckIcon className="h-3 w-3" />
                                    Özel
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted bg-surface-alt px-2 py-0.5 rounded-full">
                                    Varsayılan
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <Button
                                  variant="secondary"
                                  type="button"
                                  onClick={() => openEdit(t.key)}
                                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5"
                                >
                                  <PencilIcon className="h-3.5 w-3.5" />
                                  Düzenle
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* ─── Editor Modal ─── */}
      {editKey && (
        <div className="fixed inset-0 z-50 flex flex-col bg-heading/70 backdrop-blur-sm">
          <div
            className="m-3 flex flex-col bg-surface-elevated rounded-xl border border-border shadow-2xl overflow-hidden"
            style={{ height: 'calc(100vh - 1.5rem)' }}
          >
            {/* Header — fixed */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface-elevated shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <EnvelopeIcon className="h-5 w-5 text-primary-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-heading truncate">
                    {detail?.name || editKey}
                  </h2>
                  <p className="text-xs text-muted font-mono">{editKey}</p>
                </div>
                {detail?.isCustom && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-success-600 bg-success-500/10 px-2 py-0.5 rounded-full">
                    <CheckIcon className="h-3 w-3" />
                    Özel
                  </span>
                )}
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={closeEdit}
                className="shrink-0 p-1.5 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
              >
                <XMarkIcon className="h-5 w-5" />
              </Button>
            </div>

            {/* Body — split panel */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* LEFT: Editor */}
              <div className="flex flex-col w-1/2 border-r border-border overflow-y-auto min-w-0">
                <div className="p-4 space-y-4 flex-1 flex flex-col">
                  {/* Variables */}
                  {(() => {
                    const vars = getVariables();
                    return vars.length > 0 ? (
                      <div className="bg-primary-500/5 border border-primary-500/20 rounded-lg p-3">
                        <p className="text-xs font-medium text-muted mb-1.5">Kullanılabilir değişkenler</p>
                        <div className="flex flex-wrap gap-1.5">
                          {vars.map((v) => (
                            <code
                              key={v}
                              className="text-xs text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary-500/20 transition-colors"
                              onClick={() => {
                                const ta = document.getElementById('html-editor') as HTMLTextAreaElement | null;
                                if (!ta) return;
                                const s = ta.selectionStart;
                                const e = ta.selectionEnd;
                                const ins = `{{${v}}}`;
                                const newVal = form.bodyHtml.substring(0, s) + ins + form.bodyHtml.substring(e);
                                handleBodyChange(newVal);
                                requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + ins.length; ta.focus(); });
                              }}
                            >
                              {`{{${v}}}`}
                            </code>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Görünen Ad</label>
                    <Input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">E-posta Konusu</label>
                    <Input
                      type="text"
                      value={form.subject}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                      placeholder="Değişken kullanabilirsiniz: {{orderNumber}}"
                    />
                  </div>

                  {/* HTML Editor */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-muted">HTML Gövde</label>
                      <span className="text-xs text-muted/50">
                        {form.bodyHtml.length > 0 ? `${form.bodyHtml.length} karakter` : 'Boş (varsayılan kullanılır)'}
                      </span>
                    </div>
                    <div className="flex-1 relative rounded-lg border border-border overflow-hidden" style={{ minHeight: '320px' }}>
                      <textarea
                        id="html-editor"
                        value={form.bodyHtml}
                        onChange={(e) => handleBodyChange(e.target.value)}
                        onKeyDown={handleTabKey}
                        className="absolute inset-0 w-full h-full resize-none font-mono text-xs leading-relaxed p-3 bg-gray-950 text-gray-100 outline-none focus:ring-1 focus:ring-primary-500/50"
                        placeholder={`Boş bırakırsanız sağdaki önizlemede gözüken varsayılan şablon gönderilir.\n\nÖzelleştirmek için HTML yazın ve değişkenleri {{değişkenAdı}} formatında kullanın.\nÖrnek: Merhaba {{name}}, siparişiniz {{orderNumber}} hazırlandı.`}
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-border shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {saving ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckIcon className="h-4 w-4" />
                        )}
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                      </Button>
                      {detail?.isCustom && (
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={handleReset}
                          disabled={resetting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 border-red-500/30 disabled:opacity-50"
                        >
                          {resetting ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <TrashIcon className="h-4 w-4" />
                          )}
                          {resetting ? 'Sıfırlanıyor...' : 'Varsayılana sıfırla'}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="test@ornek.com"
                        className="min-w-0 text-sm flex-1"
                      />
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={handleSendTest}
                        disabled={sendingTest || !testEmail.trim()}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-50"
                      >
                        <PaperAirplaneIcon className="h-4 w-4" />
                        {sendingTest ? 'Gönderiliyor...' : 'Test gönder'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: Preview */}
              <div className="flex flex-col w-1/2 bg-surface-alt/20 min-w-0">
                {/* Preview header */}
                <div className="px-4 py-2.5 border-b border-border bg-surface-elevated shrink-0 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wider">Önizleme</span>
                    <span className="text-xs text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">Örnek veri</span>
                  </div>
                  {previewLoading && (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <ArrowPathIcon className="h-3 w-3 animate-spin" />
                      Güncelleniyor
                    </span>
                  )}
                </div>

                {previewError ? (
                  <div className="flex-1 flex items-center justify-center p-8 text-center">
                    <div>
                      <p className="text-sm text-muted">Önizleme yüklenemedi.</p>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => loadPreview(editKey, form.bodyHtml || undefined, form.subject || undefined)}
                        className="mt-3 text-sm"
                      >
                        Tekrar dene
                      </Button>
                    </div>
                  </div>
                ) : !preview && previewLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <ArrowPathIcon className="h-6 w-6 animate-spin text-muted" />
                  </div>
                ) : preview ? (
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    {/* Subject preview */}
                    <div className="px-4 py-2 border-b border-border bg-surface-elevated shrink-0">
                      <p className="text-xs text-muted">
                        <span className="font-medium">Konu:</span>{' '}
                        <span className="text-heading">{preview.subject || '(konu yok)'}</span>
                      </p>
                    </div>
                    {/* iframe preview */}
                    <iframe
                      key={preview.html.substring(0, 100)}
                      srcDoc={preview.html}
                      className="flex-1 w-full border-0"
                      title="E-posta önizlemesi"
                      sandbox="allow-same-origin allow-top-navigation-by-user-activation"
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8 text-center text-muted text-sm">
                    Önizleme yükleniyor...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
