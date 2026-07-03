'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';

/**
 * Dev tool: fires real Sürat REST endpoints and shows the raw responses. These
 * are diagnostic POSTs (they don't touch app data/cache), so they stay as plain
 * imperative calls with local result state — not useAdminMutation.
 */
export function SuratTestConsole() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [cref, setCref] = useState('');
  const [opLoading, setOpLoading] = useState<null | 'track' | 'cancel'>(null);
  const [opResult, setOpResult] = useState<any>(null);

  async function runEndpointTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.suratEndpointTest();
      setTestResult(res.data);
      if (res.data?.ref) setCref(res.data.ref);
    } catch (e: any) {
      setTestResult({ error: e?.response?.data?.message || e?.message || 'İstek başarısız oldu' });
    } finally {
      setTesting(false);
    }
  }

  async function runOp(op: 'track' | 'cancel') {
    const r = cref.trim();
    if (!r) {
      toast.error("Önce bir referans gir (veya 'Gönderi Oluştur + Takip' ile üret)");
      return;
    }
    setOpLoading(op);
    setOpResult(null);
    try {
      const res =
        op === 'track' ? await adminApi.suratTestTrack(r) : await adminApi.suratTestCancel(r);
      setOpResult(res.data);
    } catch (e: any) {
      setOpResult({ error: e?.response?.data?.message || e?.message || 'İstek başarısız oldu' });
    } finally {
      setOpLoading(null);
    }
  }

  return (
    <SectionCard title="Sürat Endpoint Test Konsolu" bodyClassName="space-y-4">
      <p className="text-xs text-muted">
        Elimizdeki Sürat REST endpoint&apos;lerini buradan test et. Sunucu → Sürat gerçek istek
        atar; DB&apos;ye/siparişe dokunmaz.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted">
          Yeni bir test gönderisi oluşturur, hemen takibini sorgular; referansı aşağı doldurur.
        </span>
        <Button variant="primary" size="sm" isLoading={testing} onClick={runEndpointTest}>
          {testing ? 'Test ediliyor…' : 'Gönderi Oluştur + Takip'}
        </Button>
      </div>

      {testResult && (
        <div className="space-y-2 rounded-lg bg-surface-alt p-3 font-mono text-xs">
          {testResult.error ? (
            <div className="text-danger-600">Hata: {String(testResult.error)}</div>
          ) : (
            <>
              <div>
                Referans: <span className="text-body">{testResult.ref}</span>
              </div>
              <div>
                1) Gönderi oluştur:{' '}
                <span className={testResult.create?.ok ? 'text-success-600' : 'text-danger-600'}>
                  {testResult.create?.ok ? '✓ başarılı' : '✗ hata'}
                </span>{' '}
                — {testResult.create?.message}
              </div>
              <div>
                2) Takip sorgula:{' '}
                {testResult.track?.error ? (
                  <span className="text-danger-600">✗ {testResult.track.error}</span>
                ) : (
                  <span className="text-body">
                    HTTP {testResult.track?.httpStatus} · IsError=
                    {String(testResult.track?.isError)} ·{' '}
                    {testResult.track?.durum || testResult.track?.message || '—'}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted">
          Bir referans (OzelKargoTakipNo) ile tekil endpoint testi:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={cref}
            onChange={(e) => setCref(e.target.value)}
            placeholder="Referans (OzelKargoTakipNo)"
            className="w-full font-mono text-xs sm:w-72"
          />
          <Button variant="outline" size="sm" isLoading={opLoading === 'track'} onClick={() => runOp('track')}>
            Takip Sorgula
          </Button>
          <Button variant="outline" size="sm" isLoading={opLoading === 'cancel'} onClick={() => runOp('cancel')}>
            Geri Çek (İptal)
          </Button>
        </div>
        {opResult && (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 font-mono text-xs text-body">
            {JSON.stringify(opResult, null, 2)}
          </pre>
        )}
      </div>

      <p className="text-xs text-subtle">
        Not: Barkod (OrtakBarkodOlustur) endpoint&apos;i mevcut ama istek şeması Sürat&apos;tan
        bekleniyor; geldiğinde eklenecek. Ayrıca test ortamında gönderiler fiziksel
        &quot;kabul&quot; aşamasına gelmediği için takip/iptal genelde &quot;kabul bekleniyor /
        Kayıt Bulunamadı&quot; döner (üretimde ilerler).
      </p>
    </SectionCard>
  );
}
