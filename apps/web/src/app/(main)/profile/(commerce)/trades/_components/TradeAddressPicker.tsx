'use client';

import { useEffect, useState, useCallback } from 'react';
import { MapPinIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { addressesApi } from '@/lib/api';
import { Button, Input, Textarea } from '@tarodan/ui';
import CityDistrictSelector from '@/components/CityDistrictSelector';

interface Address {
  id: string;
  title?: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  isDefault?: boolean;
}

interface TradeAddressPickerProps {
  /** Seçili adres id'si değiştiğinde çağrılır (null = seçim yok). */
  onChange: (addressId: string | null) => void;
  /** Başlık (örn. "Teslimat Adresi"). */
  label?: string;
}

/**
 * Takas akışında teslimat adresi seçtiren bileşen:
 *   - Kayıtlı adresler radyo listesi (varsayılan ön-seçili)
 *   - "Yeni adres ekle" satır-içi formu (CityDistrictSelector ile il/ilçe)
 *   - Hiç adres yoksa form doğrudan açılır
 */
export default function TradeAddressPicker({ onChange, label }: TradeAddressPickerProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    city: '',
    district: '',
    address: '',
  });

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      onChange(id);
    },
    [onChange],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await addressesApi.getAll();
      const list: Address[] = res.data?.addresses || res.data || [];
      setAddresses(list);
      if (list.length > 0) {
        const def = list.find((a) => a.isDefault) || list[0];
        select(def.id);
        setShowForm(false);
      } else {
        select(null);
        setShowForm(true);
      }
    } catch {
      setAddresses([]);
      setShowForm(true);
    } finally {
      setLoading(false);
    }
  }, [select]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!form.fullName.trim()) return toast.error('Ad soyad girin');
    if (form.phone.replace(/\D/g, '').length < 10) return toast.error('Geçerli telefon girin');
    if (!form.city) return toast.error('İl seçin');
    if (!form.district) return toast.error('İlçe seçin');
    if (form.address.trim().length < 10) return toast.error('Adres en az 10 karakter olmalı');

    setSaving(true);
    try {
      const res = await addressesApi.create({
        title: 'Takas Adresi',
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        city: form.city,
        district: form.district,
        address: form.address.trim(),
        isDefault: addresses.length === 0,
      });
      const created: Address = res.data?.address || res.data;
      toast.success('Adres eklendi');
      setForm({ fullName: '', phone: '', city: '', district: '', address: '' });
      // Listeyi tazele ve yeni adresi seç
      const listRes = await addressesApi.getAll();
      const list: Address[] = listRes.data?.addresses || listRes.data || [];
      setAddresses(list);
      setShowForm(false);
      if (created?.id) select(created.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Adres eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-20 bg-border-subtle rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-3">
      {label && (
        <p className="text-sm font-medium text-heading flex items-center gap-2">
          <MapPinIcon className="w-4 h-4 text-primary-500" />
          {label}
        </p>
      )}

      {/* Kayıtlı adresler */}
      {addresses.length > 0 && (
        <div className="space-y-2">
          {addresses.map((a) => (
            <label
              key={a.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedId === a.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-border hover:bg-surface'
              }`}
            >
              <input
                type="radio"
                name="trade-address"
                checked={selectedId === a.id}
                onChange={() => select(a.id)}
                className="mt-1"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-heading">
                  {a.fullName}
                  {a.isDefault && (
                    <span className="ml-2 text-xs text-primary-600">(Varsayılan)</span>
                  )}
                </p>
                <p className="text-sm text-muted truncate">
                  {a.district}/{a.city} · {a.phone}
                </p>
                <p className="text-xs text-subtle truncate">{a.address}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Yeni adres formu */}
      {showForm ? (
        <div className="p-4 border border-border rounded-lg bg-surface space-y-3">
          <p className="text-sm font-medium text-heading">Yeni Adres</p>
          <Input
            type="text"
            placeholder="Ad Soyad"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <Input
            type="text"
            inputMode="tel"
            placeholder="Telefon (05XX XXX XX XX)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <CityDistrictSelector
            city={form.city}
            district={form.district}
            onCityChange={(c) => setForm((prev) => ({ ...prev, city: c, district: '' }))}
            onDistrictChange={(d) => setForm((prev) => ({ ...prev, district: d }))}
          />
          <Textarea
            rows={2}
            placeholder="Açık adres (mahalle, cadde, no...)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleAdd} isLoading={saving} disabled={saving}>
              Adresi Kaydet
            </Button>
            {addresses.length > 0 && (
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                Vazgeç
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setShowForm(true)}
          leftIcon={<PlusIcon className="w-4 h-4" />}
        >
          Yeni adres ekle
        </Button>
      )}
    </div>
  );
}
