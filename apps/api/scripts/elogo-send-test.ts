/**
 * eLogo PostBoxService — GERÇEK e-Arşiv gönderim testi (DEMO ortamı).
 *
 * ⚠️ Bu script BELGE GÖNDERİR (SendDocument). DEMO ortamında çalıştır — gerçek
 *    fatura kesmez, kontör harcamaz. Prod kimliğiyle ÇALIŞTIRMA.
 *
 * Gerçek üretim kodunu kullanır: buildInvoiceXml() (UBL-TR) + LiveElogoSoapClient
 * (ZIP/MD5/SOAP). Yani başarılıysa, üretim akışı da aynı şekilde keser.
 *
 * Kullanım (apps/api altında, .env DEMO bloğu aktifken):
 *   node --env-file=.env -r ts-node/register/transpile-only scripts/elogo-send-test.ts
 *
 * Portal girdileri (env ile override):
 *   ELOGO_TEST_PREFIX   belge numarası ön eki (portalde tanımlı olmalı; vars. TRD)
 *   ELOGO_TEST_XSLTUUID görsel tasarım şablonu UUID'i (portalden)
 *   ELOGO_TEST_SUPPLIER_TITLE / _TAXOFFICE / _CITY / _DISTRICT / _ADDRESS  (satıcı=demo firma)
 */
import { randomUUID } from 'crypto';
import { LiveElogoSoapClient } from '../src/modules/elogo/elogo-soap.client';
import { buildInvoiceXml } from '../src/modules/elogo/ubl/ubl-invoice.builder';
import type { ElogoSoapCallOptions } from '../src/modules/elogo/elogo.types';

// ConfigService yerine basit env-shim (client yalnız .get(key, default) kullanır).
const configShim = { get: (k: string, d?: any) => process.env[k] ?? d } as any;
const client = new LiveElogoSoapClient(configShim);
const opts: ElogoSoapCallOptions = {
  timeoutMs: Number(process.env.ELOGO_SOAP_TIMEOUT_MS || 30000),
};

const env = (k: string, d = '') => process.env[k] ?? d;
// Varsayılan: hesabın VKN'si (kullanıcı adı). ELOGO_TEST_SUPPLIER_VKN ile FARKLI bir
// satıcı VKN'si denenebilir (eLogo başka mükellef adına kesime izin veriyor mu testi).
const SUPPLIER_VKN = env('ELOGO_TEST_SUPPLIER_VKN') || env('ELOGO_WS_USERNAME', '7620277268');
const PREFIX = env('ELOGO_TEST_PREFIX', 'TRD');
const XSLTUUID = env('ELOGO_TEST_XSLTUUID', '');

async function main() {
  const now = new Date();
  const issueDate = now.toISOString().slice(0, 10);
  const year = issueDate.slice(0, 4);
  // Benzersiz numara: yıl + zaman damgasından 9 hane (demo'da çakışmayı önler).
  const seq = String(now.getTime()).slice(-9);
  const invoiceId = `${PREFIX}${year}${seq}`;
  const uuid = randomUUID();

  // Örnek = Tarodan KOMİSYON/HİZMET faturası (e-Arşiv, son kullanıcıya).
  const { xml, totals } = buildInvoiceXml({
    profileId: 'EARSIVFATURA',
    invoiceTypeCode: 'SATIS',
    id: invoiceId,
    uuid,
    issueDate,
    issueTime: now.toTimeString().slice(0, 8),
    currency: 'TRY',
    sendType: 'ELEKTRONIK',
    note: 'Demo test e-Arşiv faturası (Tarodan hizmet bedeli).',
    supplier: {
      vknTckn: SUPPLIER_VKN,
      title: env('ELOGO_TEST_SUPPLIER_TITLE', 'TARODAN DEMO'),
      taxOffice: env('ELOGO_TEST_SUPPLIER_TAXOFFICE', 'Test VD'),
      city: env('ELOGO_TEST_SUPPLIER_CITY', 'İstanbul'),
      district: env('ELOGO_TEST_SUPPLIER_DISTRICT', 'Kadıköy'),
      streetAddress: env('ELOGO_TEST_SUPPLIER_ADDRESS', 'Test Mah. Test Cad. No:1'),
      email: env('ELOGO_TEST_SUPPLIER_EMAIL', 'destek@tarodan.com'),
    },
    customer: {
      vknTckn: '11111111111', // demo son kullanıcı (TCKN)
      firstName: 'Test',
      lastName: 'Müşteri',
      city: 'İstanbul',
      district: 'Beşiktaş',
      streetAddress: 'Örnek Mah. Örnek Sok. No:2',
      email: process.env.ELOGO_TEST_CUSTOMER_EMAIL || undefined,
    },
    lines: [
      { name: 'Tarodan Hizmet/Komisyon Bedeli', quantity: 1, unitCode: 'C62', unitPrice: 100, vatRate: 20 },
    ],
  });

  // Gönderim-şekli (AdditionalDocumentReference) bloğunu env'den özel format ile değiştir (deneme).
  let finalXml = xml;
  const stOverride = process.env.ELOGO_TEST_SENDTYPE_XML;
  if (stOverride) {
    const snippet = stOverride.replace(/__DATE__/g, issueDate);
    finalXml = xml.replace(
      /<cac:AdditionalDocumentReference>[\s\S]*?<\/cac:AdditionalDocumentReference>/,
      snippet,
    );
  }
  // UBL'yi incelemek için scratchpad'e dök.
  const fs = await import('fs');
  const dump = `${env('ELOGO_DUMP_DIR', '/tmp')}/elogo-${invoiceId}.xml`;
  try { fs.writeFileSync(dump, finalXml); } catch { /* yoksay */ }

  console.log(`→ Endpoint: ${env('ELOGO_SOAP_URL')}`);
  console.log(`→ Fatura No: ${invoiceId}  (ETTN ${uuid})`);
  console.log(`→ Tutar: matrah ${totals.taxExclusive} + KDV ${totals.tax} = ${totals.payable} TRY`);
  console.log(`→ Ön ek: ${PREFIX}${XSLTUUID ? '' : '  ⚠️ XSLTUUID YOK (env ELOGO_TEST_XSLTUUID ver)'}`);
  console.log(`→ UBL dökümü: ${dump}\n`);

  const session = await client.login(opts);
  console.log(`✅ Login OK — ${session.sessionId}`);

  const res = await client.sendDocument(
    {
      documentType: 'EARCHIVE',
      documentUuid: uuid,
      documentNumber: invoiceId,
      ublXml: finalXml,
      signed: false,
      ...(XSLTUUID ? { xsltUuid: XSLTUUID } : {}),
      extraParams: (process.env.ELOGO_TEST_EXTRA_PARAMS || 'SENDINGTYPE=ELEKTRONIK')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    session.sessionId,
    opts,
  );

  console.log(`\n📤 SendDocument → success=${res.success} code=${res.code} refId=${res.refId ?? '-'}`);
  console.log(`   resultMsg: ${res.description ?? '-'}`);

  if (res.success) {
    // Kısa bekleyip durum sorgula (GİB işleme süresi olabilir).
    await new Promise((r) => setTimeout(r, 2500));
    const st = await client.getDocumentStatus(uuid, 'EARCHIVE', session.sessionId, opts);
    console.log(`\n🔎 GetDocumentStatus → status=${st.status} code=${st.code} ${st.description ?? ''}`);
    console.log('   (1300 = GİB başarıyla tamamlandı; 1200 = zarf işlendi)');
  }

  await client.logout(session.sessionId, opts);
  console.log('\n✅ Logout. Test bitti.');
}

main().catch((e) => {
  console.error('\n❌ HATA:', e?.message || e);
  process.exit(1);
});
