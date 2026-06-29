/**
 * eLogo Login probe — doğru komplex LoginType zarfı, çoklu endpoint/kontrat.
 * Kullanım: cd apps/api && node --env-file=.env scripts/elogo-probe-variants.mjs
 */
const USER = process.env.ELOGO_WS_USERNAME || '';
const PASS = process.env.ELOGO_WS_PASSWORD || '';
const TEM = 'http://tempuri.org/';
const EFAT = 'http://schemas.datacontract.org/2004/07/eFaturaWebService';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (xml, n) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${n}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`, 'i'));
  return m ? m[1].trim() : null;
};

function loginEnvelope() {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${TEM}" xmlns:efat="${EFAT}"><soapenv:Header/><soapenv:Body><tem:Login><tem:login><efat:appStr>Tarodan</efat:appStr><efat:passWord>${esc(PASS)}</efat:passWord><efat:source></efat:source><efat:userName>${esc(USER)}</efat:userName><efat:version>1.0</efat:version></tem:login></tem:Login></soapenv:Body></soapenv:Envelope>`;
}

// [url, contractName]
const TARGETS = [
  ['https://connect.elogo.com.tr/services/EDocumentService.svc', 'IEDocumentService'],
  ['https://pb.elogo.com.tr/PostBoxService.svc', 'IPostBoxService'],
  ['https://pb.elogo.com.tr/services/PostBoxService.svc', 'IPostBoxService'],
  ['https://pb.elogo.com.tr/services/EDocumentService.svc', 'IEDocumentService'],
  ['https://connect.elogo.com.tr/services/EDocumentService.svc', 'IPostBoxService'],
];

async function call(url, contract) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${TEM}${contract}/Login` },
      body: loginEnvelope(),
      signal: ctrl.signal,
    });
    const b = await r.text();
    return { status: r.status, sid: tag(b, 'sessionID'), result: tag(b, 'LoginResult'), fault: tag(b, 'faultstring'), raw: b };
  } catch (e) { return { status: 0, error: e.message }; }
  finally { clearTimeout(t); }
}

console.log(`User: ${USER.slice(0, 4)}***\n`);
for (const [url, contract] of TARGETS) {
  const res = await call(url, contract);
  let verdict;
  if (res.sid) verdict = `✅✅✅ SESSION: ${res.sid}  (LoginResult=${res.result})`;
  else if (res.error) verdict = `bağlantı yok: ${res.error}`;
  else if ((res.fault || '').match(/Geçersiz kullanıcı|kullanıcı adı|invalid/i)) verdict = `🔑 ZARF DOĞRU! kimlik geçersiz: "${res.fault}"`;
  else if ((res.fault || '').match(/internal error/i)) verdict = `~ internal error (zarf hâlâ yanlış)`;
  else if ((res.fault || '').match(/ContractFilter|Action|cannot be processed/i)) verdict = `↪ aksiyon/kontrat uyuşmuyor`;
  else if (res.fault) verdict = `fault: ${res.fault.slice(0, 130)}`;
  else verdict = `[${res.status}] ${(res.raw || '').slice(0, 140)}`;
  console.log(`[${String(res.status).padStart(3)}] ${url} (${contract})\n       → ${verdict}\n`);
}
