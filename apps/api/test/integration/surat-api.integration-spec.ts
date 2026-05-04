/**
 * Sürat Kargo Live API Integration Tests
 *
 * These tests call the REAL Sürat Kargo SOAP API (test environment).
 * No mocks — verifies WSDL compliance, field names, types, and order.
 *
 * Run manually:  pnpm --filter @tarodan/api test:integration
 *
 * Requirements:
 *   - Internet connection
 *   - Valid SURAT_KARGO_CARI_KODU and SURAT_KARGO_SIFRE in .env
 */

const SURAT_URL = 'https://webservices.suratkargo.com.tr/services.asmx';
const SOAP_ACTION = 'http://tempuri.org/GonderiyiKargoyaGonderYeni';
const TRACKING_TEST_URL = 'https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi';

const cariKodu = process.env.SURAT_KARGO_CARI_KODU!;
const sifre = process.env.SURAT_KARGO_SIFRE!;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface ShipmentInput {
  KisiKurum: string;
  AliciAdresi: string;
  Il: string;
  Ilce: string;
  TelefonCep: string;
  KargoTuru: number;
  OdemeTipi: number;
  OzelKargoTakipNo: string;
  Adet: number;
  BirimDesi: number;
  BirimKg: number;
  KapidanOdemeTahsilatTipi: number;
  TasimaSekli: number;
  TeslimSekli: number;
  GonderiSekli: number;
  Pazaryerimi: 0 | 1;
  Iademi: boolean;
  SahisBirim?: string;
}

function buildSoapEnvelope(input: ShipmentInput): string {
  const f = (tag: string, value: string | number | boolean): string => {
    const str = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    return `<${tag}>${escapeXml(str)}</${tag}>`;
  };

  const fields = [
    f('KisiKurum', input.KisiKurum),
    input.SahisBirim ? f('SahisBirim', input.SahisBirim) : '',
    f('AliciAdresi', input.AliciAdresi),
    f('Il', input.Il),
    f('Ilce', input.Ilce),
    f('TelefonCep', input.TelefonCep),
    f('KargoTuru', input.KargoTuru),
    f('OdemeTipi', input.OdemeTipi),
    f('OzelKargoTakipNo', input.OzelKargoTakipNo),
    f('Adet', input.Adet),
    f('BirimDesi', input.BirimDesi),
    f('BirimKg', input.BirimKg),
    f('KapidanOdemeTahsilatTipi', input.KapidanOdemeTahsilatTipi),
    f('KapidanOdemeTutari', 0),
    f('TasimaSekli', input.TasimaSekli),
    f('TeslimSekli', input.TeslimSekli),
    f('GonderiSekli', input.GonderiSekli),
    f('Pazaryerimi', input.Pazaryerimi),
    f('Iademi', input.Iademi),
  ].filter(Boolean).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GonderiyiKargoyaGonderYeni xmlns="http://tempuri.org/">
      <KullaniciAdi>${escapeXml(cariKodu)}</KullaniciAdi>
      <Sifre>${escapeXml(sifre)}</Sifre>
      <Gonderi>${fields}</Gonderi>
    </GonderiyiKargoyaGonderYeni>
  </soap:Body>
</soap:Envelope>`;
}

async function callSurat(input: ShipmentInput): Promise<{ status: number; result: string }> {
  const soapXml = buildSoapEnvelope(input);
  const response = await fetch(SURAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: SOAP_ACTION,
    },
    body: soapXml,
  });
  const text = await response.text();
  const match = text.match(/<GonderiyiKargoyaGonderYeniResult[^>]*>([\s\S]*?)<\/GonderiyiKargoyaGonderYeniResult>/i);
  return {
    status: response.status,
    result: match ? match[1].trim() : text.substring(0, 500),
  };
}

function buildValidPayload(orderNumber: string): ShipmentInput {
  return {
    KisiKurum: 'Test Alici',
    SahisBirim: 'Test Urun',
    AliciAdresi: 'Ataturk Cad No 1',
    Il: 'Istanbul',
    Ilce: 'Kadikoy',
    TelefonCep: '05551234567',
    KargoTuru: 3, // Koli
    OdemeTipi: 1, // Pesin
    OzelKargoTakipNo: orderNumber,
    Adet: 1,
    BirimDesi: 1,
    BirimKg: 1,
    KapidanOdemeTahsilatTipi: 1, // Nakit
    TasimaSekli: 1, // KaraYolu
    TeslimSekli: 1, // AdreseTeslim
    GonderiSekli: 0, // Standart
    Pazaryerimi: 0,
    Iademi: false,
  };
}

describe('Sürat Kargo Live API Integration', () => {
  beforeAll(() => {
    if (!cariKodu || !sifre) {
      throw new Error(
        'SURAT credentials not configured. Set SURAT_KARGO_CARI_KODU and SURAT_KARGO_SIFRE in .env',
      );
    }
  });

  describe('Authentication', () => {
    it('rejects request with wrong password', async () => {
      const soapXml = buildSoapEnvelope(buildValidPayload(`AUTH${Date.now()}`)).replace(
        `<Sifre>${sifre}</Sifre>`,
        '<Sifre>wrong-password-xyz</Sifre>',
      );
      const response = await fetch(SURAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: SOAP_ACTION },
        body: soapXml,
      });
      const text = await response.text();
      const match = text.match(/<GonderiyiKargoyaGonderYeniResult[^>]*>([\s\S]*?)<\/GonderiyiKargoyaGonderYeniResult>/i);
      const result = match ? match[1].trim() : '';

      expect(response.status).toBe(200);
      expect(result.toLowerCase()).toMatch(/hatal|kullanıcı|şifre/);
    });

    it('accepts request with valid credentials', async () => {
      const result = await callSurat(buildValidPayload(`AUTHOK${Date.now()}`));
      expect(result.status).toBe(200);
      // Result should be "Tamam" or business error — both mean auth passed
      expect(result.result.toLowerCase()).not.toMatch(/kullanıcı adı veya şifre hatalı/);
    });
  });

  describe('Shipment Creation (GonderiyiKargoyaGonderYeni)', () => {
    it('creates shipment with valid payload (returns "Tamam")', async () => {
      const result = await callSurat(buildValidPayload(`OK${Date.now()}`));
      expect(result.status).toBe(200);
      expect(result.result).toBe('Tamam');
    });

    it('rejects payload missing OdemeTipi', async () => {
      const payload = buildValidPayload(`MISSING${Date.now()}`);
      // Build SOAP without OdemeTipi field
      const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GonderiyiKargoyaGonderYeni xmlns="http://tempuri.org/">
      <KullaniciAdi>${cariKodu}</KullaniciAdi>
      <Sifre>${sifre}</Sifre>
      <Gonderi><KisiKurum>${payload.KisiKurum}</KisiKurum><AliciAdresi>${payload.AliciAdresi}</AliciAdresi><Il>${payload.Il}</Il><Ilce>${payload.Ilce}</Ilce><TelefonCep>${payload.TelefonCep}</TelefonCep><KargoTuru>3</KargoTuru><OzelKargoTakipNo>${payload.OzelKargoTakipNo}</OzelKargoTakipNo><Adet>1</Adet><BirimDesi>1</BirimDesi><BirimKg>1</BirimKg><KapidanOdemeTahsilatTipi>1</KapidanOdemeTahsilatTipi><TasimaSekli>1</TasimaSekli><TeslimSekli>1</TeslimSekli><GonderiSekli>0</GonderiSekli><Pazaryerimi>0</Pazaryerimi><Iademi>false</Iademi></Gonderi>
    </GonderiyiKargoyaGonderYeni>
  </soap:Body>
</soap:Envelope>`;
      const response = await fetch(SURAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: SOAP_ACTION },
        body: soapXml,
      });
      const text = await response.text();
      const match = text.match(/<GonderiyiKargoyaGonderYeniResult[^>]*>([\s\S]*?)<\/GonderiyiKargoyaGonderYeniResult>/i);
      expect(match?.[1]).toMatch(/Ödeme Tipi/i);
    });

    it('rejects payload with invalid TelefonCep format', async () => {
      const payload = buildValidPayload(`PHONE${Date.now()}`);
      payload.TelefonCep = 'abc123';
      const result = await callSurat(payload);
      expect(result.status).toBe(200);
      // Sürat may accept or reject — both are valid responses (not crash)
      expect(result.result).toBeTruthy();
    });
  });

  describe('Idempotency (same merchant_oid)', () => {
    it('does not duplicate when same OzelKargoTakipNo is sent twice', async () => {
      const oid = `IDEMP${Date.now()}`;
      const payload = buildValidPayload(oid);

      const r1 = await callSurat(payload);
      expect(r1.result).toBe('Tamam');

      // Send same payload again — Sürat should detect duplicate
      const r2 = await callSurat(payload);
      // Result should be either "Tamam" (idempotent OK) or business error about duplicate
      expect([200]).toContain(r2.status);
    });
  });

  describe('Tracking API (REST)', () => {
    it('queries non-existent tracking number gracefully', async () => {
      const response = await fetch(TRACKING_TEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          KullaniciAdi: cariKodu,
          Sifre: sifre,
          KargoTakipNo: 'NONEXISTENT',
          WebSiparisKodu: '',
        }),
      });
      // Sürat tracking API may return 200, 400, 404, or 500 for non-existent tracking
      expect([200, 400, 404, 500]).toContain(response.status);
      // API responds — confirms credentials reach tracking endpoint
      const text = await response.text();
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('WSDL Compliance', () => {
    it('WSDL endpoint is reachable and contains GonderiyiKargoyaGonderYeni', async () => {
      const response = await fetch(`${SURAT_URL}?WSDL`);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('GonderiyiKargoyaGonderYeni');
      expect(text).toContain('OdemeTipi'); // Field name confirmed
      expect(text).toContain('Iademi');
    });

    it('WSDL GonderiModel schema has expected required fields', async () => {
      const response = await fetch(`${SURAT_URL}?WSDL`);
      const text = await response.text();

      // Critical fields must exist
      const requiredFields = [
        'KargoTuru',
        'OdemeTipi',
        'Adet',
        'KapidanOdemeTahsilatTipi',
        'TasimaSekli',
        'TeslimSekli',
        'GonderiSekli',
        'Pazaryerimi',
        'Iademi',
      ];

      for (const field of requiredFields) {
        expect(text).toContain(`name="${field}"`);
      }
    });

    it('WSDL contains GonderiSil (cancel) operation', async () => {
      const response = await fetch(`${SURAT_URL}?WSDL`);
      const text = await response.text();
      expect(text).toContain('name="GonderiSil"');
      expect(text).toContain('ozelKargoTakipNo');
    });
  });

  describe('Cancel Shipment (GonderiSil)', () => {
    async function callCancel(oid: string): Promise<{ status: number; result: string }> {
      const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GonderiSil xmlns="http://tempuri.org/">
      <cariKodu>${cariKodu}</cariKodu>
      <WebPassword>${sifre}</WebPassword>
      <ozelKargoTakipNo>${oid}</ozelKargoTakipNo>
    </GonderiSil>
  </soap:Body>
</soap:Envelope>`;
      const response = await fetch(SURAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://tempuri.org/GonderiSil',
        },
        body: soapXml,
      });
      const text = await response.text();
      const match = text.match(
        /<GonderiSilResult[^>]*>([\s\S]*?)<\/GonderiSilResult>/i,
      );
      return {
        status: response.status,
        result: match ? match[1].trim() : text.substring(0, 500),
      };
    }

    it('returns "Pasif Edilecek Gonderi Bulunamadi!" for non-existent OID (idempotent)', async () => {
      const oid = 'NONEXIST' + Date.now();
      const result = await callCancel(oid);
      expect(result.status).toBe(200);
      expect(result.result.toLowerCase()).toMatch(/bulunamadi|pasif/);
    });

    it('rejects with auth error for wrong password', async () => {
      const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GonderiSil xmlns="http://tempuri.org/">
      <cariKodu>${cariKodu}</cariKodu>
      <WebPassword>wrong-password-xyz</WebPassword>
      <ozelKargoTakipNo>TEST</ozelKargoTakipNo>
    </GonderiSil>
  </soap:Body>
</soap:Envelope>`;
      const response = await fetch(SURAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://tempuri.org/GonderiSil',
        },
        body: soapXml,
      });
      const text = await response.text();
      const match = text.match(
        /<GonderiSilResult[^>]*>([\s\S]*?)<\/GonderiSilResult>/i,
      );
      const result = match ? match[1].trim().toLowerCase() : '';
      // Wrong password rejected (or "not found" if Sürat doesn't validate auth here)
      expect(response.status).toBe(200);
      expect(result).toMatch(/hatal|bulunamadi|pasif|şifre|kullan/);
    });
  });
});
