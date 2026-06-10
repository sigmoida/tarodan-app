'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CreditCardIcon, TrashIcon, PlusIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { paymentsApi } from '@/lib/api';
import { Button, Input, Spinner } from '@tarodan/ui';

interface SavedCard {
  id: string;
  cardBrand: string;
  lastFour: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

export default function SavedCardsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ number: '', name: '', expiry: '', cvc: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentsApi.getMethods();
      const list = res.data?.methods ?? res.data ?? [];
      setCards(Array.isArray(list) ? list : []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/payments/cards');
      return;
    }
    load();
  }, [authLoading, isAuthenticated, router, load]);

  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = form.number.replace(/\s/g, '');
    const [mm, yy] = form.expiry.split('/');
    if (num.length < 13 || !form.name.trim() || !mm || !yy || form.cvc.length < 3) {
      toast.error('Kart bilgilerini eksiksiz girin');
      return;
    }
    setSaving(true);
    try {
      await paymentsApi.addMethod({
        cardNumber: num,
        cardHolderName: form.name.trim(),
        expireMonth: mm,
        expireYear: yy,
        cvc: form.cvc,
      });
      toast.success('Kart eklendi');
      setForm({ number: '', name: '', expiry: '', cvc: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Kart eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kartı silmek istediğinize emin misiniz?')) return;
    try {
      await paymentsApi.deleteMethod(id);
      toast.success('Kart silindi');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Kart silinemedi');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await paymentsApi.setDefaultMethod(id);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'İşlem başarısız');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-heading mb-1 flex items-center gap-2">
            <CreditCardIcon className="w-7 h-7" /> Kayıtlı Kartlarım
          </h1>
          <p className="text-muted text-sm">
            Eklediğin kart üyelik otomatik yenilemesinde kullanılır. (Geliştirme ortamı: kart
            bilgisi güvenli saklama yerine demo amaçlı tutulur.)
          </p>
        </div>

        {/* Saved cards */}
        <div className="space-y-3 mb-8">
          {cards.length === 0 ? (
            <div className="p-6 bg-surface-elevated border border-border rounded-lg text-center text-muted">
              Henüz kayıtlı kartınız yok. Aşağıdan ekleyebilirsiniz.
            </div>
          ) : (
            cards.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-4 bg-surface-elevated border border-border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <CreditCardIcon className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-heading">
                      {c.cardBrand} •••• {c.lastFour}
                    </p>
                    <p className="text-sm text-muted">
                      Son kullanma: {String(c.expiryMonth).padStart(2, '0')}/{c.expiryYear}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.isDefault ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-success-100 text-success-700 text-xs font-medium rounded-full">
                      <CheckCircleIcon className="w-4 h-4" /> Varsayılan
                    </span>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => handleSetDefault(c.id)}>
                      Varsayılan yap
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="p-2 text-danger-600 hover:bg-danger-50 rounded"
                    aria-label="Kartı sil"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add card form */}
        <form onSubmit={handleAdd} className="bg-surface-elevated border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
            <PlusIcon className="w-5 h-5" /> Yeni Kart Ekle
          </h2>
          <Input
            placeholder="Kart Numarası"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: formatCardNumber(e.target.value) })}
            inputMode="numeric"
          />
          <Input
            placeholder="Kart Üzerindeki İsim"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              placeholder="AA/YY"
              value={form.expiry}
              onChange={(e) => setForm({ ...form, expiry: formatExpiry(e.target.value) })}
              inputMode="numeric"
            />
            <Input
              placeholder="CVC"
              value={form.cvc}
              onChange={(e) => setForm({ ...form, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              inputMode="numeric"
            />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Ekleniyor...' : 'Kartı Kaydet'}
          </Button>
        </form>
      </main>
    </div>
  );
}
