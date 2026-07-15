"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPinIcon, PlusIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Input, Textarea } from "@tarodan/ui";
import CityDistrictSelector from "@/components/CityDistrictSelector";
import { useAddresses, useSaveAddress } from "../../../_hooks/useAddresses";

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
 *
 * Adres verisi paylaşılan `useAddresses` sorgusundan / `useSaveAddress`
 * mutasyonundan gelir (ortak `['profile-addresses']` cache'i; elle fetch/refetch
 * yok).
 */
export default function TradeAddressPicker({
  onChange,
  label,
}: TradeAddressPickerProps) {
  const { addresses, isLoading } = useAddresses(true);
  const saveAddress = useSaveAddress();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    city: "",
    district: "",
    address: "",
  });

  const initializedRef = useRef(false);
  // Set of ids captured before a create, so the effect below can pick the newly
  // added address once the invalidated query refetches.
  const pendingIdsRef = useRef<Set<string> | null>(null);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      onChange(id);
    },
    [onChange],
  );

  // Initialize once the list first arrives: pre-select the default (or first), or
  // open the form when there are none.
  useEffect(() => {
    if (isLoading || initializedRef.current) return;
    initializedRef.current = true;
    if (addresses.length > 0) {
      const def = addresses.find((a) => a.isDefault) || addresses[0];
      select(def.id);
      setShowForm(false);
    } else {
      select(null);
      setShowForm(true);
    }
  }, [isLoading, addresses, select]);

  // After a successful create, the query refetches; select the new address.
  useEffect(() => {
    const prev = pendingIdsRef.current;
    if (!prev) return;
    const created = addresses.find((a) => !prev.has(a.id));
    if (created) {
      pendingIdsRef.current = null;
      select(created.id);
      setShowForm(false);
    }
  }, [addresses, select]);

  const handleAdd = async () => {
    if (!form.fullName.trim()) return toast.error("Ad soyad girin");
    // +905XXXXXXXXX → 12 hane (90 + 10). Kayıtlı adres formuyla aynı doğrulama.
    if (form.phone.replace(/\D/g, "").length < 12)
      return toast.error("Geçerli telefon girin");
    if (!form.city) return toast.error("İl seçin");
    if (!form.district) return toast.error("İlçe seçin");
    if (form.address.trim().length < 10)
      return toast.error("Adres en az 10 karakter olmalı");

    pendingIdsRef.current = new Set(addresses.map((a) => a.id));
    try {
      await saveAddress.mutateAsync({
        id: null,
        values: {
          title: "Takas Adresi",
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          city: form.city,
          district: form.district,
          address: form.address.trim(),
          isDefault: addresses.length === 0,
        },
      });
      setForm({ fullName: "", phone: "", city: "", district: "", address: "" });
    } catch {
      // useSaveAddress already surfaces the error toast.
      pendingIdsRef.current = null;
    }
  };

  if (isLoading) {
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
                  ? "border-primary-500 bg-primary-50"
                  : "border-border hover:bg-surface"
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
                    <span className="ml-2 text-xs text-primary-600">
                      (Varsayılan)
                    </span>
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
          {/* Telefon — kayıtlı adres formundaki (+90 önekli, 10 hane, formatlı)
              yerleşik pattern. Ham input "sonsuz karakter" alıyordu. */}
          <div className="flex">
            <span className="inline-flex items-center px-3 bg-surface-alt border border-r-0 border-border rounded-l text-muted font-medium">
              +90
            </span>
            <Input
              type="tel"
              inputMode="tel"
              value={form.phone
                .replace("+90", "")
                .replace(/\s/g, "")
                .slice(0, 10)
                .replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4")
                .trim()}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                setForm({ ...form, phone: "+90" + digits });
              }}
              placeholder="5XX XXX XX XX"
              maxLength={14}
              className="rounded-l-none"
            />
          </div>
          <CityDistrictSelector
            city={form.city}
            district={form.district}
            onCityChange={(c) =>
              setForm((prev) => ({ ...prev, city: c, district: "" }))
            }
            onDistrictChange={(d) =>
              setForm((prev) => ({ ...prev, district: d }))
            }
          />
          <Textarea
            rows={2}
            placeholder="Açık adres (mahalle, cadde, no...)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAdd}
              isLoading={saveAddress.isPending}
              disabled={saveAddress.isPending}
            >
              Adresi Kaydet
            </Button>
            {addresses.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={saveAddress.isPending}
              >
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
