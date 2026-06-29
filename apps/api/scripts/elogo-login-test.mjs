/**
 * eLogo PostBoxService bağlantı testi — SADECE OKUMA (Login + Logout, opsiyonel mükellef sorgu).
 * ⚠️ FATURA KESMEZ, kontör harcamaz. SendDocument burada YOK.
 *
 * Kullanım (apps/api altında):
 *   node --env-file=.env scripts/elogo-login-test.mjs
 *   ELOGO_TEST_VKN=1234567890 node --env-file=.env scripts/elogo-login-test.mjs   (mükellef sorgu da yapar)
 */
const URL = process.env.ELOGO_SOAP_URL || 'https://pb.elogo.com.tr/PostBoxService.svc';
const USER = process.env.ELOGO_WS_USERNAME || '';
const PASS = process.env.ELOGO_WS_PASSWORD || '';
const TEST_VKN = process.env.ELOGO_TEST_VKN || '';
const TEM = 'http://tempuri.org/';
const EFAT = 'http://schemas.datacontract.org/2004/07/eFaturaWebService';
const ARR = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (xml, n) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${n}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`, 'i'));
  return m ? m[1].trim() : null;
};

async function soap(operation, bodyInner) {
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${TEM}" xmlns:arr="${ARR}" xmlns:efat="${EFAT}"><soapenv:Header/><soapenv:Body>${bodyInner}</soapenv:Body></soapenv:Envelope>`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${TEM}IPostBoxService/${operation}` },
      body, signal: ctrl.signal,
    });
    return { status: r.status, xml: await r.text() };
  } finally { clearTimeout(t); }
}

async function main() {
  if (!USER || !PASS) { console.error('❌ ELOGO_WS_USERNAME/PASSWORD .env içinde yok.'); process.exit(2); }
  console.log(`→ ${URL}\n→ Kullanıcı: ${USER.slice(0, 4)}***\n`);

  // 1) Login
  const loginInner = `<tem:Login><tem:login><efat:appStr>Tarodan</efat:appStr><efat:passWord>${esc(PASS)}</efat:passWord><efat:source></efat:source><efat:userName>${esc(USER)}</efat:userName><efat:version>1.0</efat:version></tem:login></tem:Login>`;
  const lg = await soap('Login', loginInner);
  const sessionId = tag(lg.xml, 'sessionID');
  const fault = tag(lg.xml, 'faultstring');
  if (!sessionId) {
    console.error(`❌ Login başarısız [${lg.status}]: ${fault || lg.xml.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`✅ LOGIN OK — SessionID: ${sessionId}`);

  // 2) (opsiyonel) Mükellef sorgu — okuma-only
  if (TEST_VKN) {
    const inner = `<tem:GetValidateGIBUser><tem:sessionID>${esc(sessionId)}</tem:sessionID><tem:paramList><arr:string>VKN=${esc(TEST_VKN)}</arr:string><arr:string>DOCUMENTTYPE=0</arr:string></tem:paramList></tem:GetValidateGIBUser>`;
    const gv = await soap('GetValidateGIBUser', inner);
    const isGib = tag(gv.xml, 'ISGIBUSER') ?? (gv.xml.match(/ISGIBUSER\s*=\s*([^<"]+)/i)?.[1]?.trim());
    console.log(`\n🔎 GetValidateGIBUser(VKN=${TEST_VKN}): ISGIBUSER=${isGib ?? '?'} → ${isGib === '1' ? 'e-FATURA mükellefi' : 'e-ARŞİV (kayıtsız/bireysel)'}`);
    console.log(`   (ham yanıt ilk 400): ${gv.xml.slice(0, 400)}`);
  }

  // 3) Logout
  await soap('Logout', `<tem:Logout><tem:sessionID>${esc(sessionId)}</tem:sessionID></tem:Logout>`);
  console.log(`\n✅ Logout yapıldı. Bağlantı uçtan uca çalışıyor. (Fatura kesilmedi.)`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
