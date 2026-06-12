'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { bankAccountApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { Button, Input } from '@tarodan/ui';
import { isValidTrIban, normalizeIban, formatIbanDisplay } from '@/lib/iban';

interface BankAccount {
  id: string;
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string | null;
  taxId?: string | null;
  isVerified: boolean;
}

export default function BankAccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [form, setForm] = useState({ accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/bank-account');
    }
  }, [authLoading, isAuthenticated, router]);

  const accountQuery = useQuery({
    queryKey: ['bank-account'],
    queryFn: async (): Promise<BankAccount | null> => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled: !authLoading && isAuthenticated,
  });

  // Sunucudan gelen kayıt formu doldursun (IBAN boşluklu gösterilir).
  useEffect(() => {
    const acc = accountQuery.data;
    if (acc) {
      setForm({
        accountHolder: acc.accountHolder || '',
        iban: formatIbanDisplay(acc.iban || ''),
        tcKimlikNo: acc.tcKimlikNo || '',
        taxId: acc.taxId || '',
      });
    }
  }, [accountQuery.data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.accountHolder.trim().length < 2) {
      toast.error('Hesap sahibi adı en az 2 karakter olmalıdır');
      return;
    }
    if (!isValidTrIban(form.iban)) {
      toast.error('Geçerli bir TR IBAN giriniz (TR + 24 rakam)');
      return;
    }
    if (form.tcKimlikNo && !/^\d{11}$/.test(form.tcKimlikNo)) {
      toast.error('TC Kimlik No 11 rakam olmalıdır');
      return;
    }

    const payload = {
      accountHolder: form.accountHolder.trim(),
      iban: normalizeIban(form.iban),
      ...(form.tcKimlikNo ? { tcKimlikNo: form.tcKimlikNo } : {}),
      ...(form.taxId ? { taxId: form.taxId } : {}),
    };

    setIsSaving(true);
    try {
      await bankAccountApi.upsert(payload);
      toast.success('Banka hesabı kaydedildi');
      await queryClient.invalidateQueries({ queryKey: ['bank-account'] });
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Kaydetme başarısız';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Banka hesabınızı silmek istediğinize emin misiniz?')) return;
    try {
      await bankAccountApi.delete();
      toast.success('Banka hesabı silindi');
      setForm({ accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' });
      await queryClient.invalidateQueries({ queryKey: ['bank-account'] });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme başarısız');
    }
  };

  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return null;

  const existing = accountQuery.data;

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Banka Hesabı / IBAN</h1>
          <p className="text-muted">
            Satışlarınızdan elde ettiğiniz tutar bu IBAN&apos;a aktarılır.
          </p>
        </div>

        {existing && (
          <div className="mb-6 flex items-center gap-2">
            {existing.isVerified ? (
              <span className="inline-block px-2 py-1 bg-success-100 text-success-700 text-xs rounded">
                Doğrulandı
              </span>
            ) : (
              <span className="inline-block px-2 py-1 bg-warning-100 text-warning-700 text-xs rounded">
                Doğrulanmadı
              </span>
            )}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-elevated rounded shadow-sm p-6"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1">
                Hesap Sahibi <span className="text-danger-500">*</span>
              </label>
              <Input
                type="text"
                value={form.accountHolder}
                onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
                className="rounded"
                placeholder="Ad Soyad / Firma Ünvanı"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                IBAN <span className="text-danger-500">*</span>
              </label>
              <Input
                type="text"
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: formatIbanDisplay(e.target.value) })}
                className="rounded font-mono"
                placeholder="TR.. .... .... .... .... .... .."
                required
              />
              <p className="text-xs text-muted mt-1">TR ile başlayan 26 karakterli IBAN</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                TC Kimlik No (opsiyonel)
              </label>
              <Input
                type="text"
                value={form.tcKimlikNo}
                onChange={(e) =>
                  setForm({ ...form, tcKimlikNo: e.target.value.replace(/\D/g, '').slice(0, 11) })
                }
                className="rounded"
                placeholder="11 rakam"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                Vergi No (opsiyonel)
              </label>
              <Input
                type="text"
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value.slice(0, 20) })}
                className="rounded"
                placeholder="Kurumsal hesaplar için"
              />
            </div>

            {existing && (
              <p className="text-xs text-muted">
                Bilgileri güncellerseniz hesabınız yeniden doğrulanana kadar
                &quot;Doğrulanmadı&quot; durumuna döner.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              {existing && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-4 py-2 text-danger-500 hover:bg-danger-50 rounded"
                >
                  <TrashIcon className="w-5 h-5" />
                  Sil
                </Button>
              )}
              <Button
                variant="secondary"
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-primary-500 text-inverted rounded hover:bg-primary-600 disabled:opacity-60"
              >
                {isSaving ? 'Kaydediliyor...' : existing ? 'Güncelle' : 'Kaydet'}
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
