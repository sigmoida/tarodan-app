'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  LifebuoyIcon,
  TruckIcon,
  CreditCardIcon,
  UserCircleIcon,
  TagIcon,
  ArrowsRightLeftIcon,
  WrenchScrewdriverIcon,
  EllipsisHorizontalCircleIcon,
  ChatBubbleLeftRightIcon,
  QuestionMarkCircleIcon,
  EnvelopeIcon,
  PlusIcon,
  ChevronRightIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { supportApi } from '@/lib/api';
import { Button, Input, Textarea } from '@tarodan/ui';

const CATEGORIES = [
  { id: 'shipping', label: 'Sipariş / Kargo', icon: TruckIcon },
  { id: 'payment', label: 'Ödeme', icon: CreditCardIcon },
  { id: 'account', label: 'Hesap', icon: UserCircleIcon },
  { id: 'product', label: 'İlan / Ürün', icon: TagIcon },
  { id: 'trade', label: 'Takas', icon: ArrowsRightLeftIcon },
  { id: 'technical', label: 'Teknik Sorun', icon: WrenchScrewdriverIcon },
  { id: 'other', label: 'Diğer', icon: EllipsisHorizontalCircleIcon },
] as const;

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: 'Açık', className: 'bg-info-100 text-info-800' },
  in_progress: { label: 'İnceleniyor', className: 'bg-warning-100 text-warning-800' },
  waiting_customer: { label: 'Yanıtınız Bekleniyor', className: 'bg-primary-100 text-primary-800' },
  resolved: { label: 'Çözüldü', className: 'bg-success-100 text-success-800' },
  closed: { label: 'Kapatıldı', className: 'bg-surface-alt text-muted' },
};

interface Ticket {
  id: string;
  ticketNumber?: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export default function SupportPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    category: '' as string,
    subject: '',
    message: '',
  });
  const [orderId, setOrderId] = useState<string | undefined>(undefined);

  // Sipariş detayından "Sipariş Sorunu Bildir" ile gelindiğinde formu önceden doldur
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get('orderId') || undefined;
    if (!oid) return;
    setOrderId(oid);
    setShowForm(true);
    setForm((prev) => ({
      ...prev,
      category: prev.category || 'shipping',
      subject: prev.subject || `Sipariş sorunu (#${oid.slice(0, 8)})`,
    }));
  }, []);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res = await supportApi.getMyTickets({ page: 1, pageSize: 10 });
      const data: any = res.data;
      setTickets(data?.tickets || data?.data || (Array.isArray(data) ? data : []));
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadTickets();
    }
  }, [authLoading, isAuthenticated, loadTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category) {
      toast.error('Lütfen bir kategori seçin');
      return;
    }
    if (form.subject.trim().length < 5) {
      toast.error('Konu en az 5 karakter olmalıdır');
      return;
    }
    if (form.message.trim().length < 10) {
      toast.error('Mesajınız en az 10 karakter olmalıdır');
      return;
    }

    setSubmitting(true);
    try {
      await supportApi.createTicket({
        subject: form.subject.trim(),
        category: form.category,
        message: form.message.trim(),
        ...(orderId ? { orderId } : {}),
      });
      toast.success('Destek talebiniz oluşturuldu. En kısa sürede dönüş yapacağız.');
      setForm({ category: '', subject: '', message: '' });
      setOrderId(undefined);
      setShowForm(false);
      loadTickets();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Talep oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-inverted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <LifebuoyIcon className="w-14 h-14 mx-auto mb-4 opacity-90" />
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Destek Merkezi</h1>
          <p className="text-lg opacity-90 max-w-2xl mx-auto">
            Size yardımcı olmak için buradayız. Sorununuzu bildirin, ekibimiz en kısa sürede
            sizinle ilgilensin.
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Quick links */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Link
            href="/help"
            className="flex items-center gap-3 bg-surface-elevated border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
          >
            <QuestionMarkCircleIcon className="w-8 h-8 text-info-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-heading">Yardım Merkezi</p>
              <p className="text-sm text-muted">Rehberler ve konu başlıkları</p>
            </div>
          </Link>
          <Link
            href="/faq"
            className="flex items-center gap-3 bg-surface-elevated border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
          >
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-success-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-heading">Sıkça Sorulan Sorular</p>
              <p className="text-sm text-muted">Hızlı yanıtlar</p>
            </div>
          </Link>
          <Link
            href="/contact"
            className="flex items-center gap-3 bg-surface-elevated border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
          >
            <EnvelopeIcon className="w-8 h-8 text-primary-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-heading">İletişim</p>
              <p className="text-sm text-muted">Bize yazın</p>
            </div>
          </Link>
        </div>

        {!authLoading && !isAuthenticated && (
          <div className="bg-surface-elevated border border-border rounded-xl p-8 text-center">
            <LifebuoyIcon className="w-12 h-12 text-subtle mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-heading mb-2">
              Destek talebi oluşturmak için giriş yapın
            </h2>
            <p className="text-muted mb-6">
              Siparişleriniz, ödemeleriniz veya hesabınızla ilgili talepler için giriş yapmanız
              gerekir. Üye değilseniz iletişim formunu da kullanabilirsiniz.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/login?redirect=/support"
                className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-inverted rounded-lg font-medium transition-colors"
              >
                Giriş Yap
              </Link>
              <Link
                href="/contact"
                className="px-6 py-2.5 border border-border hover:bg-surface rounded-lg font-medium text-heading transition-colors"
              >
                İletişim Formu
              </Link>
            </div>
          </div>
        )}

        {isAuthenticated && (
          <>
            {/* Create ticket */}
            <div className="bg-surface-elevated border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-heading">Destek Talebi Oluştur</h2>
                {!showForm && (
                  <Button onClick={() => setShowForm(true)} leftIcon={<PlusIcon className="w-5 h-5" />}>
                    Yeni Talep
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted mb-4">
                Sorununuzu kategorisiyle birlikte iletin; ekibimiz genellikle 24 saat içinde yanıt
                verir.
              </p>

              {showForm && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-heading mb-2">Kategori</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {CATEGORIES.map((cat) => (
                        <Button
                          key={cat.id}
                          type="button"
                          variant="outline"
                          onClick={() => setForm({ ...form, category: cat.id })}
                          className={`h-auto flex-col gap-2 p-3 text-sm font-normal whitespace-normal ${
                            form.category === cat.id
                              ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium hover:bg-primary-50'
                              : 'text-body'
                          }`}
                        >
                          <cat.icon className="w-6 h-6" />
                          {cat.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Input
                    id="subject"
                    type="text"
                    label="Konu"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Örn: Siparişim kargoya verilmedi"
                    maxLength={200}
                  />

                  <Textarea
                    id="message"
                    rows={5}
                    label="Mesajınız"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Sorununuzu mümkün olduğunca ayrıntılı anlatın. Varsa sipariş numaranızı ekleyin."
                    maxLength={2000}
                    helperText={`${form.message.length}/2000`}
                  />

                  <div className="flex items-center gap-3">
                    <Button type="submit" isLoading={submitting} disabled={submitting}>
                      Talebi Gönder
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                      Vazgeç
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* My tickets */}
            <div className="bg-surface-elevated border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-heading mb-4">Taleplerim</h2>
              {ticketsLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 bg-border-subtle rounded-lg" />
                  ))}
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8">
                  <ClockIcon className="w-10 h-10 text-subtle mx-auto mb-3" />
                  <p className="text-muted">Henüz bir destek talebiniz yok.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {tickets.map((ticket) => {
                    const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
                    const category = CATEGORIES.find((c) => c.id === ticket.category);
                    return (
                      <li key={ticket.id} className="py-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-heading truncate">{ticket.subject}</p>
                          <p className="text-sm text-muted">
                            {category?.label || ticket.category}
                            {' · '}
                            {new Date(ticket.createdAt).toLocaleDateString('tr-TR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${status.className}`}
                        >
                          {status.label}
                        </span>
                        <ChevronRightIcon className="w-5 h-5 text-subtle flex-shrink-0" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {/* Contact info */}
        <div className="bg-surface-elevated border border-border rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-heading mb-2">Hâlâ yardıma mı ihtiyacınız var?</h2>
          <p className="text-muted mb-4">
            E-posta ile de bize ulaşabilirsiniz; hafta içi 09.00–18.00 arasında yanıt veriyoruz.
          </p>
          <a
            href="mailto:destek@tarodan.com"
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
          >
            <EnvelopeIcon className="w-5 h-5" />
            destek@tarodan.com
          </a>
        </div>
      </main>
    </div>
  );
}
