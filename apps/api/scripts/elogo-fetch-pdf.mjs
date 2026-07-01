/**
 * Kesilmiş bir e-Arşiv faturanın PDF'ini eLogo'dan çeker (getEArchiveInvoicePdfData).
 * SADECE OKUMA. Kullanım:
 *   ELOGO_PDF_UUID=<ettn> ELOGO_PDF_OUT=/path/fatura.pdf node --env-file=.env scripts/elogo-fetch-pdf.mjs
 */
import { writeFileSync } from 'fs';
const URL = process.env.ELOGO_SOAP_URL || 'https://pb-demo.elogo.com.tr/PostboxService.svc';
const USER = process.env.ELOGO_WS_USERNAME || '';
const PASS = process.env.ELOGO_WS_PASSWORD || '';
const UUID = process.env.ELOGO_PDF_UUID || '';
const OUT = process.env.ELOGO_PDF_OUT || '/tmp/elogo-fatura.pdf';
const TEM = 'http://tempuri.org/';
const EFAT = 'http://schemas.datacontract.org/2004/07/eFaturaWebService';
const ARR = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function soap(op, inner) {
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${TEM}" xmlns:arr="${ARR}" xmlns:efat="${EFAT}"><soapenv:Header/><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${TEM}IPostBoxService/${op}` },
    body,
  });
  return r.text();
}
const tag = (xml, n) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${n}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`, 'i'));
  return m ? m[1].trim() : null;
};

async function main() {
  if (!UUID) { console.error('❌ ELOGO_PDF_UUID gerekli'); process.exit(2); }
  const lg = await soap('Login', `<tem:Login><tem:login><efat:appStr>Tarodan</efat:appStr><efat:passWord>${esc(PASS)}</efat:passWord><efat:source></efat:source><efat:userName>${esc(USER)}</efat:userName><efat:version>1.0</efat:version></tem:login></tem:Login>`);
  const sid = tag(lg, 'sessionID');
  if (!sid) { console.error('❌ Login başarısız:', lg.slice(0, 300)); process.exit(1); }
  console.log('✅ Login:', sid);

  const inner = `<tem:getEArchiveInvoicePdfData><tem:sessionID>${esc(sid)}</tem:sessionID><tem:uuid>${esc(UUID)}</tem:uuid><tem:allInvoicesOrJustSigned>true</tem:allInvoicesOrJustSigned><tem:isCanceled>false</tem:isCanceled></tem:getEArchiveInvoicePdfData>`;
  const res = await soap('getEArchiveInvoicePdfData', inner);
  // Yanıttaki en büyük base64 bloğunu PDF olarak yaz.
  const blobs = [...res.matchAll(/>([A-Za-z0-9+/=]{500,})</g)].map((m) => m[1]);
  if (!blobs.length) { console.error('❌ PDF base64 bulunamadı. Yanıt:', res.slice(0, 600)); process.exit(1); }
  const b64 = blobs.sort((a, b) => b.length - a.length)[0];
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(OUT, buf);
  const sig = buf.slice(0, 5).toString('latin1');
  console.log(`✅ Yazıldı: ${OUT} (${buf.length} byte, başlık="${sig}")`);
  await soap('Logout', `<tem:Logout><tem:sessionID>${esc(sid)}</tem:sessionID></tem:Logout>`);
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
