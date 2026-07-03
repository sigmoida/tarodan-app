'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Select } from '@tarodan/ui';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { DataTable } from '@/components/DataTable';
import { col } from '@/components/table';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  type AdjustAction,
  type SearchItem,
  TYPES,
  typeOptions,
  fmt,
  previewAfter,
} from '../_lib/types';

export function TimeAdjustCard({ isProd }: { isProd: boolean }) {
  const confirm = useConfirm();
  const [type, setType] = useState('boost');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [minutes, setMinutes] = useState(1);
  const [days, setDays] = useState(1);

  const placeholder = useMemo(() => TYPES.find((t) => t.value === type)?.placeholder ?? '', [type]);

  const doSearch = async () => {
    if (q.trim().length < 2) {
      toast.error('En az 2 karakter girin');
      return;
    }
    setSearching(true);
    setResults([]);
    try {
      const r = await adminApi.get('/admin/test-tools/search', { params: { type, q } });
      setResults(r.data);
      if (!r.data.length) toast('Sonuç yok', { icon: '🔍' });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  };

  const askAdjust = async (item: SearchItem, action: AdjustAction, value: number) => {
    const field = Object.keys(item.dates)[0] ?? 'tarih';
    const after = previewAfter(action, value);
    const ok = await confirm({
      title: 'Onayla',
      confirmLabel: 'Uygula',
      description: (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            <b className="text-heading">{item.label}</b> kaydının <code>{field}</code> alanı
            değişecek:
          </p>
          <div className="space-y-1 rounded-lg bg-surface-alt p-3">
            <div>
              <span className="text-muted">Eski:</span> {fmt(item.dates[field] ?? null)}
            </div>
            <div>
              <span className="text-muted">Yeni:</span> <b>{fmt(after)}</b>
            </div>
          </div>
          {isProd && <p className="text-xs text-danger-700">⚠ PROD — gerçek veri değişecek.</p>}
        </div>
      ),
    });
    if (!ok) return;

    try {
      const r = await adminApi.post('/admin/test-tools/adjust', {
        type,
        id: item.id,
        action,
        value,
      });
      toast.success(`${r.data.field}: ${fmt(r.data.after)}`);
      await doSearch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Değişiklik başarısız');
    }
  };

  const columns = [
    col.custom<SearchItem>('Kayıt', (item) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-heading">{item.label}</div>
        <div className="truncate text-xs text-subtle">{item.id}</div>
      </div>
    )),
    col.muted<SearchItem>('Durum', (item) => item.status ?? '—'),
    col.custom<SearchItem>('Tarihler', (item) => (
      <div className="space-y-0.5">
        {Object.entries(item.dates).map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="text-muted">{k}:</span> {fmt(v)}
          </div>
        ))}
      </div>
    )),
    col.custom<SearchItem>(
      'Aksiyon',
      (item) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => askAdjust(item, 'expire_now', 0)}>
            Şimdi bitir
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => askAdjust(item, 'set_minutes', minutes)}
          >
            {minutes} dk sonra
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => askAdjust(item, 'backdate_days', days)}
          >
            {days} gün geri
          </Button>
        </div>
      ),
      { grow: 3, minWidth: 260 },
    ),
  ];

  return (
    <SectionCard title="Süre Ayarlama" bodyClassName="space-y-4">
      <p className="-mt-2 text-sm text-muted">
        Tek bir kaydı ara, ilgili tarih alanını geri/ileri al. Sonra ilgili cron'u tetikleyip
        davranışı doğrula.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Tip"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setResults([]);
          }}
          options={typeOptions}
          className="w-48"
        />
        <Input
          label={`Ara (${placeholder})`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          className="min-w-[220px] flex-1"
        />
        <Button onClick={doSearch} isLoading={searching}>
          Ara
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Input
          type="number"
          min={0}
          label="X dk sonra"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="w-28"
        />
        <Input
          type="number"
          min={0}
          label="N gün geri"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-28"
        />
      </div>

      {results.length > 0 && (
        <DataTable columns={columns} data={results} getRowId={(r) => r.id} />
      )}
    </SectionCard>
  );
}
